import express, { NextFunction, Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { getAuth } from "@clerk/express";
import { config } from "../config";
import { confirmPayment, getProvider, providerForRegion } from "../payments";
import { PaymentError, PaymentMethod } from "../payments/types";
import { getTariff } from "../pro/tariffs";
import { analyzeFashionImage } from "../services/gemini";
import { guestId, guestUsage, reserveSearch, userUsage } from "../services/usage";
import { getUser, primaryEmail } from "../services/users";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const PAYMENT_METHODS = new Set<PaymentMethod>(["bank_card", "sbp", "yoo_money"]);

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const userIdOf = (req: Request): string | null => getAuth(req).userId ?? null;

function requireUser(req: Request, res: Response): string | null {
  const id = userIdOf(req);
  if (!id) res.status(401).json({ error: "unauthorized", message: "Войдите в аккаунт" });
  return id;
}

/** Accepts raw base64 or a data URL. Returns null if the image is invalid or too large. */
function parseImage(image: unknown, mimeType: unknown): { data: string; mime: string } | null {
  if (typeof image !== "string" || image.length === 0) return null;
  let data = image;
  let mime = typeof mimeType === "string" ? mimeType.toLowerCase() : "image/jpeg";
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(image);
  if (m) {
    mime = m[1].toLowerCase();
    data = m[2];
  }
  if (!ALLOWED_MIME.has(mime)) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > config.limits.maxImageBytes) return null;
  return { data, mime };
}

export function apiRouter(): Router {
  const r = Router();

  r.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));

  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Current user's PRO status and free search counter (or guest counter)
  r.get(
    "/me",
    asyncRoute(async (req, res) => {
      const uid = userIdOf(req);
      const usage = uid ? userUsage(await getUser(uid)) : guestUsage(guestId(req, res));
      res.json({ ...usage, paymentsTestMode: providerForRegion("Russia").isTestMode() });
    }),
  );

  // Photo search: session + limit are checked here, then the server calls Gemini itself
  r.post(
    "/analyze",
    rateLimit({
      windowMs: 60_000,
      limit: config.limits.analyzePerMinute,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "rate_limited", message: "Слишком много запросов. Подождите минуту." },
    }),
    express.json({ limit: Math.ceil(config.limits.maxImageBytes * 1.4) + 4096 }),
    asyncRoute(async (req, res) => {
      const img = parseImage(req.body?.image, req.body?.mimeType);
      if (!img) {
        return res.status(400).json({
          error: "bad_image",
          message: `Нужно фото JPG, PNG или WEBP до ${Math.round(config.limits.maxImageBytes / 1024 / 1024)} МБ`,
        });
      }
      const region = typeof req.body?.region === "string" ? req.body.region : "Russia";

      const uid = userIdOf(req);
      const reservation = await reserveSearch({ userId: uid, gid: uid ? "" : guestId(req, res), ip: req.ip ?? "" });
      if ("reason" in reservation) {
        return res.status(402).json({ error: reservation.reason, usage: reservation.usage });
      }

      let items;
      try {
        items = await analyzeFashionImage(img.data, img.mime, region);
      } catch (e) {
        await reservation.release(false);
        throw e;
      }
      const usage = await reservation.release(items.length > 0);
      res.json({ items, usage });
    }),
  );

  // Creates a payment on the server and returns the provider page to redirect to
  r.post(
    "/payments",
    rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false }),
    express.json({ limit: "10kb" }),
    asyncRoute(async (req, res) => {
      const uid = requireUser(req, res);
      if (!uid) return;
      const tariff = getTariff(req.body?.tariff);
      if (!tariff) return res.status(400).json({ error: "bad_tariff" });
      const method = PAYMENT_METHODS.has(req.body?.method) ? (req.body.method as PaymentMethod) : undefined;

      const provider = providerForRegion(req.body?.region);
      if (!provider.isConfigured()) return res.status(503).json({ error: "payments_disabled", message: "Оплата временно недоступна" });

      const user = await getUser(uid);
      const payment = await provider.createPayment({
        userId: uid,
        email: primaryEmail(user),
        tariff,
        method,
        returnUrl: `${config.publicUrl}/?payment_return=${provider.id}`,
      });
      console.log(`[payments] created ${payment.provider}:${payment.paymentId} user ${uid} tariff ${tariff.id}`);
      res.json(payment);
    }),
  );

  // Called by the frontend after returning from the payment page. Works even if the webhook is late.
  r.get(
    "/payments/:provider/:id",
    asyncRoute(async (req, res) => {
      const uid = requireUser(req, res);
      if (!uid) return;
      const provider = getProvider(req.params.provider);
      if (!provider || !provider.isConfigured()) return res.status(404).json({ error: "unknown_provider" });
      const result = await confirmPayment(provider, req.params.id, uid);
      const usage = userUsage(await getUser(uid));
      res.json({ status: result.status, usage });
    }),
  );

  // YooKassa notifications (payment.succeeded etc.). The body is only a hint:
  // the payment is re-read from the YooKassa API before PRO is granted.
  r.post(
    "/webhooks/yookassa",
    express.json({ limit: "100kb" }),
    asyncRoute(async (req, res) => {
      const provider = getProvider("yookassa")!;
      const notice = provider.parseWebhook(req);
      if (!notice) return res.status(400).json({ error: "bad_notification" });
      if (notice.event === "payment.succeeded") {
        const result = await confirmPayment(provider, notice.paymentId);
        console.log(`[webhook] yookassa ${notice.paymentId}: ${result.status}${result.applied === false ? " (already applied)" : ""}`);
      }
      // 200 tells YooKassa to stop retrying. On errors we return 500 and YooKassa retries later.
      res.json({ ok: true });
    }),
  );

  r.use((_req, res) => res.status(404).json({ error: "not_found" }));

  // Errors: log details on the server, send a short message to the client
  r.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof PaymentError ? err.status : 500;
    console.error("[api]", err?.message ?? err);
    if (res.headersSent) return;
    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        error: "bad_image",
        message: `Фото больше ${Math.round(config.limits.maxImageBytes / 1024 / 1024)} МБ`,
      });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "bad_request", message: "Некорректный запрос" });
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: "server_error",
      message: status === 403 ? "Нет доступа" : "Ошибка сервера. Попробуйте позже.",
    });
  });

  return r;
}
