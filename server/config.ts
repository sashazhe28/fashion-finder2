import "./env";
import path from "path";

const str = (name: string, fallback = ""): string => (process.env[name] ?? fallback).trim();
const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (name: string, fallback: boolean): boolean => {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
};

const isProduction = str("NODE_ENV") === "production";

export const config = {
  isProduction,
  port: int("PORT", 3000),
  host: str("HOST", isProduction ? "127.0.0.1" : "0.0.0.0"),
  // Public address of the site, used for payment return URLs
  publicUrl: str("PUBLIC_URL", "http://localhost:3000").replace(/\/+$/, ""),
  dataDir: path.resolve(str("DATA_DIR", "./data")),

  gemini: {
    apiKey: str("GEMINI_API_KEY"),
    model: str("GEMINI_MODEL", "gemini-3-flash-preview"),
    // Optional second model if the main one keeps answering 503/429 (e.g. a stable flash model)
    fallbackModel: str("GEMINI_FALLBACK_MODEL"),
  },

  clerk: {
    secretKey: str("CLERK_SECRET_KEY"),
    publishableKey: str("CLERK_PUBLISHABLE_KEY") || str("VITE_CLERK_PUBLISHABLE_KEY"),
  },

  limits: {
    freeGuestSearches: int("FREE_GUEST_SEARCHES", 2),
    freeUserSearches: int("FREE_USER_SEARCHES", 2),
    // Extra cap per IP per day for guests, so clearing cookies does not give unlimited searches
    guestSearchesPerIpPerDay: int("GUEST_SEARCHES_PER_IP_PER_DAY", 20),
    maxImageBytes: int("MAX_IMAGE_MB", 5) * 1024 * 1024,
    analyzePerMinute: int("ANALYZE_RATE_PER_MINUTE", 10),
  },

  guestCookieSecret: str("GUEST_COOKIE_SECRET"),

  yookassa: {
    shopId: str("YOOKASSA_SHOP_ID"),
    secretKey: str("YOOKASSA_SECRET_KEY"),
    apiUrl: str("YOOKASSA_API_URL", "https://api.yookassa.ru/v3"),
    // Check that webhooks come from YooKassa IP ranges (the payment is re-checked via API anyway)
    checkWebhookIp: bool("YOOKASSA_CHECK_IP", true),
    // 54-FZ receipt. Enable if "Чеки от ЮKassa" (or another online cash register) is connected to the shop
    sendReceipt: bool("YOOKASSA_RECEIPT", false),
    vatCode: int("YOOKASSA_VAT_CODE", 1),
    taxSystemCode: int("YOOKASSA_TAX_SYSTEM_CODE", 0),
  },
};

export type AppConfig = typeof config;

export function configWarnings(): string[] {
  const w: string[] = [];
  if (!config.gemini.apiKey) w.push("GEMINI_API_KEY is not set: photo search will not work");
  if (!config.clerk.secretKey) w.push("CLERK_SECRET_KEY is not set: sign-in checks on the server will fail");
  if (!config.clerk.publishableKey) w.push("CLERK_PUBLISHABLE_KEY / VITE_CLERK_PUBLISHABLE_KEY is not set");
  if (!config.yookassa.shopId || !config.yookassa.secretKey) w.push("YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY are not set: payments are disabled");
  if (config.isProduction && config.publicUrl.startsWith("http://localhost")) w.push("PUBLIC_URL is not set: payment return URL points to localhost");
  return w;
}
