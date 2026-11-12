// Client for our own server API. Gemini, limits and payments are handled on the server;
// the browser never sees the Gemini key or payment secrets.

export interface Usage {
  signedIn: boolean;
  isPro: boolean;
  proUntil: string | null;
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  paymentsTestMode?: boolean;
}

export interface AnalyzedItem {
  itemDescription: string;
  searchQuery: string;
}

export type TariffId = "day" | "week" | "month";
export type PaymentMethod = "bank_card" | "sbp" | "yoo_money";
export type TokenGetter = () => Promise<string | null>;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data: any) {
    super(message);
  }
}

async function request<T>(path: string, getToken: TokenGetter | null, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken ? await getToken() : null;
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "error", data?.message ?? `HTTP ${res.status}`, data);
  return data as T;
}

export const api = {
  me: (getToken: TokenGetter | null) => request<Usage>("/me", getToken),

  analyze: (getToken: TokenGetter | null, body: { image: string; mimeType: string; region: string }) =>
    request<{ items: AnalyzedItem[]; usage: Usage }>("/analyze", getToken, { method: "POST", body }),

  createPayment: (getToken: TokenGetter, body: { tariff: TariffId; method: PaymentMethod; region: string }) =>
    request<{ provider: string; paymentId: string; confirmationUrl: string }>("/payments", getToken, { method: "POST", body }),

  paymentStatus: (getToken: TokenGetter, provider: string, paymentId: string) =>
    request<{ status: string; usage: Usage }>(`/payments/${encodeURIComponent(provider)}/${encodeURIComponent(paymentId)}`, getToken),
};

// Pending payment id is kept only to know what to check after the redirect back.
// It grants nothing by itself: the server verifies the payment with the provider.
const PENDING_KEY = "fashionfinder_pending_payment";

export const pendingPayment = {
  save: (p: { provider: string; paymentId: string }) => localStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, at: Date.now() })),
  load: (): { provider: string; paymentId: string; at: number } | null => {
    try {
      const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
      return p && typeof p.provider === "string" && typeof p.paymentId === "string" ? p : null;
    } catch {
      return null;
    }
  },
  clear: () => localStorage.removeItem(PENDING_KEY),
};
