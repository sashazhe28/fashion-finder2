import crypto from "crypto";
import net from "net";
import type { Request } from "express";
import { config } from "../config";
import { priceOf } from "../pro/tariffs";
import {
  CreatedPayment,
  CreatePaymentInput,
  PaymentError,
  PaymentProvider,
  PaymentStatus,
  ProviderPayment,
  WebhookNotice,
} from "./types";

// YooKassa API v3: https://yookassa.ru/developers/api

const cfg = config.yookassa;

// IP ranges YooKassa sends notifications from (https://yookassa.ru/developers/using-api/webhooks)
const YOOKASSA_V4 = ["185.71.76.0/27", "185.71.77.0/27", "77.75.153.0/25", "77.75.156.11/32", "77.75.156.35/32", "77.75.154.128/25"];
const YOOKASSA_V6_PREFIX = "2a02:5180:";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isYookassaIp(rawIp: string): boolean {
  const ip = rawIp.replace(/^::ffff:/, "");
  if (net.isIPv6(ip)) return ip.toLowerCase().startsWith(YOOKASSA_V6_PREFIX);
  if (!net.isIPv4(ip)) return false;
  const n = ipv4ToInt(ip);
  return YOOKASSA_V4.some((cidr) => {
    const [base, bits] = cidr.split("/");
    const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${cfg.shopId}:${cfg.secretKey}`).toString("base64");
}

async function api<T>(method: "GET" | "POST", path: string, body?: unknown, idempotenceKey?: string): Promise<T> {
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  if (!res.ok) {
    const err = new PaymentError(`YooKassa ${method} ${path}: ${res.status} ${json?.code ?? ""} ${json?.description ?? text}`.trim());
    (err as any).yookassa = json;
    throw err;
  }
  return json as T;
}

interface YkPayment {
  id: string;
  status: PaymentStatus;
  paid: boolean;
  test?: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
}

function toProviderPayment(p: YkPayment): ProviderPayment {
  return {
    provider: "yookassa",
    paymentId: p.id,
    status: p.status,
    paid: !!p.paid,
    amount: Number(p.amount?.value),
    currency: p.amount?.currency,
    userId: p.metadata?.user_id ?? null,
    tariffId: p.metadata?.tariff ?? null,
    test: !!p.test,
  };
}

export const yookassaProvider: PaymentProvider = {
  id: "yookassa",
  currency: "RUB",

  isConfigured: () => !!(cfg.shopId && cfg.secretKey),

  // Test shops have secret keys starting with "test_"
  isTestMode: () => cfg.secretKey.startsWith("test_"),

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const price = priceOf(input.tariff, "RUB");
    if (price === null) throw new PaymentError(`No RUB price for tariff ${input.tariff.id}`, 500);
    const value = price.toFixed(2);

    const body: Record<string, unknown> = {
      amount: { value, currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: `FashionFinder: ${input.tariff.title}`,
      metadata: { user_id: input.userId, tariff: input.tariff.id },
    };

    if (cfg.sendReceipt) {
      if (!input.email) throw new PaymentError("Для чека нужен email в аккаунте", 400);
      body.receipt = {
        customer: { email: input.email },
        items: [
          {
            description: input.tariff.title,
            quantity: "1.00",
            amount: { value, currency: "RUB" },
            vat_code: cfg.vatCode,
            payment_mode: "full_payment",
            payment_subject: "service",
          },
        ],
        ...(cfg.taxSystemCode ? { tax_system_code: cfg.taxSystemCode } : {}),
      };
    }

    const create = (withMethod: boolean) =>
      api<YkPayment>(
        "POST",
        "/payments",
        withMethod && input.method ? { ...body, payment_method_data: { type: input.method } } : body,
        crypto.randomUUID(),
      );

    let payment: YkPayment;
    try {
      payment = await create(true);
    } catch (e: any) {
      // If the chosen method is not enabled in the shop, let the user pick on the YooKassa page
      const param = e?.yookassa?.parameter ?? "";
      if (input.method && typeof param === "string" && param.startsWith("payment_method_data")) {
        payment = await create(false);
      } else {
        throw e;
      }
    }

    const url = payment.confirmation?.confirmation_url;
    if (!url) throw new PaymentError("YooKassa did not return confirmation_url");
    return { provider: "yookassa", paymentId: payment.id, confirmationUrl: url };
  },

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    if (!/^[\w-]{10,64}$/.test(paymentId)) throw new PaymentError("Bad payment id", 400);
    return toProviderPayment(await api<YkPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`));
  },

  parseWebhook(req: Request): WebhookNotice | null {
    if (cfg.checkWebhookIp && !isYookassaIp(req.ip ?? "")) {
      console.warn(`[yookassa] webhook from unexpected IP ${req.ip}, ignored`);
      return null;
    }
    const body = req.body as any;
    if (body?.type !== "notification" || typeof body?.event !== "string") return null;
    const id = body?.object?.id;
    if (typeof id !== "string") return null;
    return { event: body.event, paymentId: id };
  },
};
