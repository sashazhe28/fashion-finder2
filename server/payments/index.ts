import { grantPro } from "../pro/entitlements";
import { getTariff, priceOf } from "../pro/tariffs";
import { PaymentError, PaymentProvider, PaymentStatus, ProviderId } from "./types";
import { yookassaProvider } from "./yookassa";

// Provider registry and region-based choice.
// Later: add polarProvider here and set e.g. USA/Europe -> "polar".
const PROVIDERS: Partial<Record<ProviderId, PaymentProvider>> = {
  yookassa: yookassaProvider,
};

const PROVIDER_BY_REGION: Record<string, ProviderId> = {
  Russia: "yookassa",
  "Central Asia": "yookassa",
  USA: "yookassa",
  Europe: "yookassa",
};
const DEFAULT_PROVIDER: ProviderId = "yookassa";

export function getProvider(id: string): PaymentProvider | null {
  return PROVIDERS[id as ProviderId] ?? null;
}

export function providerForRegion(region: unknown): PaymentProvider {
  const id = (typeof region === "string" && PROVIDER_BY_REGION[region]) || DEFAULT_PROVIDER;
  const provider = PROVIDERS[id] ?? PROVIDERS[DEFAULT_PROVIDER];
  if (!provider) throw new PaymentError("No payment provider configured", 500);
  return provider;
}

export interface ConfirmResult {
  status: PaymentStatus;
  proUntil?: string;
  applied?: boolean;
}

/**
 * Single place where a payment turns into PRO. Used by the webhook and by the return page.
 * Reads the payment from the provider API, checks status, amount and owner, then grants PRO idempotently.
 */
export async function confirmPayment(provider: PaymentProvider, paymentId: string, expectedUserId?: string): Promise<ConfirmResult> {
  const p = await provider.fetchPayment(paymentId);

  if (expectedUserId && p.userId !== expectedUserId) throw new PaymentError("Payment belongs to another user", 403);
  if (p.status !== "succeeded" || !p.paid) return { status: p.status };

  const tariff = getTariff(p.tariffId);
  if (!tariff || !p.userId) throw new PaymentError(`Payment ${p.paymentId} has no valid tariff/user in metadata`, 422);
  const price = priceOf(tariff, provider.currency);
  if (price === null || p.currency !== provider.currency || Math.abs(p.amount - price) > 0.001) {
    throw new PaymentError(`Payment ${p.paymentId} amount ${p.amount} ${p.currency} does not match tariff ${tariff.id}`, 422);
  }

  const res = await grantPro({ userId: p.userId, days: tariff.days, paymentKey: `${provider.id}:${p.paymentId}` });
  return { status: p.status, proUntil: res.proUntil, applied: res.applied };
}
