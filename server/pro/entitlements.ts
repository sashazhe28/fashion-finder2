import path from "path";
import { config } from "../config";
import { JsonStore } from "../lib/jsonStore";
import { withLock } from "../lib/mutex";
import { ClerkUser, getUser, patchMetadata, userLockKey } from "../services/users";

// Common PRO logic, independent of the payment provider.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REMEMBERED_PAYMENTS = 100;

interface LedgerEntry {
  userId: string;
  days: number;
  appliedAt: string;
  proUntil: string;
}

// Local ledger of applied payments: second line of defence against double extension
// (in addition to privateMetadata.pro_payments in Clerk) and an audit log.
const ledger = new JsonStore<{ applied: Record<string, LedgerEntry> }>(path.join(config.dataDir, "payments-ledger.json"), {
  applied: {},
});

export function proUntilOf(user: ClerkUser): Date | null {
  const raw = (user.publicMetadata as Record<string, unknown> | undefined)?.pro_until;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isPro(user: ClerkUser, now = new Date()): boolean {
  const until = proUntilOf(user);
  return !!until && until.getTime() > now.getTime();
}

export interface GrantInput {
  userId: string;
  days: number;
  /** Unique id of the payment, prefixed with provider, e.g. "yookassa:2f3a..." */
  paymentKey: string;
}

export interface GrantResult {
  applied: boolean; // false if this payment was already applied before
  proUntil: string;
}

/**
 * Extends PRO by `days`. Idempotent: the same paymentKey never extends PRO twice,
 * even if the provider sends the notification again or the return page also confirms it.
 * If PRO is still active, days are added to the current end date.
 */
export function grantPro({ userId, days, paymentKey }: GrantInput): Promise<GrantResult> {
  return withLock(userLockKey(userId), async () => {
    const already = ledger.get().applied[paymentKey];
    if (already) return { applied: false, proUntil: already.proUntil };

    const user = await getUser(userId);
    const priv = (user.privateMetadata ?? {}) as Record<string, unknown>;
    const applied = Array.isArray(priv.pro_payments) ? (priv.pro_payments as string[]) : [];
    const current = proUntilOf(user);
    if (applied.includes(paymentKey)) {
      return { applied: false, proUntil: current?.toISOString() ?? new Date().toISOString() };
    }

    const now = Date.now();
    const base = current && current.getTime() > now ? current.getTime() : now;
    const proUntil = new Date(base + days * DAY_MS).toISOString();

    await patchMetadata(userId, {
      publicMetadata: { pro_until: proUntil },
      privateMetadata: { pro_payments: [...applied, paymentKey].slice(-MAX_REMEMBERED_PAYMENTS) },
    });

    ledger.get().applied[paymentKey] = { userId, days, appliedAt: new Date(now).toISOString(), proUntil };
    ledger.flush();

    console.log(`[pro] ${paymentKey}: user ${userId} +${days}d, PRO until ${proUntil}`);
    return { applied: true, proUntil };
  });
}
