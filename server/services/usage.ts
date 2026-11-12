import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import { config } from "../config";
import { JsonStore } from "../lib/jsonStore";
import { withLock } from "../lib/mutex";
import { isPro, proUntilOf } from "../pro/entitlements";
import { ClerkUser, getUser, patchMetadata, userLockKey } from "./users";

// Free search limits, checked only on the server.
//  - Registered users: counter in Clerk privateMetadata (cannot be reset from the browser).
//  - Guests: counter bound to a signed httpOnly cookie, plus a daily cap per IP,
//    so clearing cookies does not give unlimited free searches.

const GUEST_COOKIE = "ff_gid";
const GUEST_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

function loadSecret(): string {
  if (config.guestCookieSecret) return config.guestCookieSecret;
  const file = path.join(config.dataDir, "guest-cookie-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
const secret = loadSecret();

interface GuestData {
  guests: Record<string, { used: number; updatedAt: number }>;
  ips: Record<string, { day: string; used: number }>;
}
const guestStore = new JsonStore<GuestData>(path.join(config.dataDir, "guest-usage.json"), { guests: {}, ips: {} });

const sign = (value: string) => crypto.createHmac("sha256", secret).update(value).digest("base64url");
const ipKey = (ip: string) => sign(`ip:${ip}`).slice(0, 22);
const today = () => new Date().toISOString().slice(0, 10);

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Returns the guest id from a valid signed cookie, or issues a new one. */
export function guestId(req: Request, res: Response): string {
  const raw = readCookie(req, GUEST_COOKIE);
  if (raw) {
    const [id, sig] = raw.split(".");
    if (id && sig) {
      const expected = Buffer.from(sign(id));
      const given = Buffer.from(sig);
      if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return id;
    }
  }
  const id = crypto.randomUUID();
  res.cookie(GUEST_COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: GUEST_COOKIE_MAX_AGE_MS,
    path: "/",
  });
  return id;
}

export interface UsageInfo {
  signedIn: boolean;
  isPro: boolean;
  proUntil: string | null;
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
}

export function userUsage(user: ClerkUser): UsageInfo {
  const used = Number((user.privateMetadata as Record<string, unknown>)?.free_searches_used) || 0;
  const limit = config.limits.freeUserSearches;
  return {
    signedIn: true,
    isPro: isPro(user),
    proUntil: proUntilOf(user)?.toISOString() ?? null,
    freeLimit: limit,
    freeUsed: Math.min(used, limit),
    freeRemaining: Math.max(0, limit - used),
  };
}

export function guestUsage(gid: string): UsageInfo {
  const used = guestStore.get().guests[gid]?.used ?? 0;
  const limit = config.limits.freeGuestSearches;
  return {
    signedIn: false,
    isPro: false,
    proUntil: null,
    freeLimit: limit,
    freeUsed: Math.min(used, limit),
    freeRemaining: Math.max(0, limit - used),
  };
}

export type Reservation =
  | { ok: true; usage: UsageInfo; release: (searchSucceeded: boolean) => Promise<UsageInfo> }
  | { ok: false; reason: "guest_limit" | "guest_ip_limit" | "pro_required"; usage: UsageInfo };

/**
 * Reserves one search before calling Gemini. If the call fails, the search is given back,
 * so users do not lose free attempts because of AI errors.
 */
export async function reserveSearch(opts: { userId: string | null; gid: string; ip: string }): Promise<Reservation> {
  const { userId, gid, ip } = opts;

  if (userId) {
    return withLock(userLockKey(userId), async () => {
      const user = await getUser(userId);
      const usage = userUsage(user);
      if (usage.isPro) {
        return { ok: true as const, usage, release: async () => usage };
      }
      if (usage.freeRemaining <= 0) return { ok: false as const, reason: "pro_required" as const, usage };

      const used = usage.freeUsed + 1;
      const updated = await patchMetadata(userId, { privateMetadata: { free_searches_used: used } });
      return {
        ok: true as const,
        usage: userUsage(updated),
        release: async (searchSucceeded: boolean) => {
          if (searchSucceeded) return userUsage(updated);
          return withLock(userLockKey(userId), async () => {
            const fresh = await getUser(userId);
            const current = Number((fresh.privateMetadata as Record<string, unknown>)?.free_searches_used) || 0;
            const back = await patchMetadata(userId, { privateMetadata: { free_searches_used: Math.max(0, current - 1) } });
            return userUsage(back);
          });
        },
      };
    });
  }

  return withLock(`guest:${gid}`, async () => {
    const data = guestStore.get();
    const usage = guestUsage(gid);
    if (usage.freeRemaining <= 0) return { ok: false as const, reason: "guest_limit" as const, usage };

    const key = ipKey(ip);
    const day = today();
    const ipEntry = data.ips[key]?.day === day ? data.ips[key] : { day, used: 0 };
    if (ipEntry.used >= config.limits.guestSearchesPerIpPerDay) {
      return { ok: false as const, reason: "guest_ip_limit" as const, usage };
    }

    data.guests[gid] = { used: (data.guests[gid]?.used ?? 0) + 1, updatedAt: Date.now() };
    data.ips[key] = { day, used: ipEntry.used + 1 };
    guestStore.touch();

    return {
      ok: true as const,
      usage: guestUsage(gid),
      release: async (searchSucceeded: boolean) => {
        if (!searchSucceeded) {
          const g = data.guests[gid];
          if (g) g.used = Math.max(0, g.used - 1);
          const i = data.ips[key];
          if (i && i.day === day) i.used = Math.max(0, i.used - 1);
          guestStore.touch();
        }
        return guestUsage(gid);
      },
    };
  });
}

// Drop old IP counters once a day so the file does not grow forever
setInterval(() => {
  const data = guestStore.get();
  const day = today();
  for (const [k, v] of Object.entries(data.ips)) if (v.day !== day) delete data.ips[k];
  guestStore.touch();
}, 6 * 60 * 60 * 1000).unref();
