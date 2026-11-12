import type { Request } from "express";
import type { Currency, Tariff, TariffId } from "../pro/tariffs";

// Common interface for payment providers. To add Polar (or another provider):
// 1) implement PaymentProvider in payments/<name>.ts,
// 2) register it in payments/index.ts and map regions to it,
// 3) add its webhook route (one line in routes/api.ts) and its prices in pro/tariffs.ts.
// PRO granting (pro/entitlements.ts) does not change.

export type ProviderId = "yookassa" | "polar";

export type PaymentMethod = "bank_card" | "sbp" | "yoo_money";

export type PaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export interface CreatePaymentInput {
  userId: string;
  email: string | null;
  tariff: Tariff;
  method?: PaymentMethod;
  returnUrl: string;
}

export interface CreatedPayment {
  provider: ProviderId;
  paymentId: string;
  confirmationUrl: string;
}

/** Payment as read directly from the provider API (trusted source). */
export interface ProviderPayment {
  provider: ProviderId;
  paymentId: string;
  status: PaymentStatus;
  paid: boolean;
  amount: number;
  currency: Currency | string;
  userId: string | null;
  tariffId: TariffId | string | null;
  test: boolean;
}

export interface WebhookNotice {
  event: string;
  paymentId: string;
}

export interface PaymentProvider {
  id: ProviderId;
  currency: Currency;
  isConfigured(): boolean;
  isTestMode(): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Reads the payment from the provider API. Never trust webhook body without this call. */
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  /** Extracts payment id from a webhook. Returns null if the request is not a valid notice. */
  parseWebhook(req: Request): WebhookNotice | null;
}

export class PaymentError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}
