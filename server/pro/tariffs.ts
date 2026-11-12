// PRO tariffs. Prices per currency, so a second provider (e.g. Polar in USD/EUR)
// only needs its own price column here.
export type TariffId = "day" | "week" | "month";
export type Currency = "RUB" | "USD" | "EUR";

export interface Tariff {
  id: TariffId;
  days: number;
  title: string;
  prices: Partial<Record<Currency, number>>;
}

export const TARIFFS: Record<TariffId, Tariff> = {
  day: { id: "day", days: 1, title: "PRO-доступ на 1 день", prices: { RUB: 49 } },
  week: { id: "week", days: 7, title: "PRO-доступ на 7 дней", prices: { RUB: 149 } },
  month: { id: "month", days: 30, title: "PRO-доступ на 30 дней", prices: { RUB: 390 } },
};

export function getTariff(id: unknown): Tariff | null {
  return typeof id === "string" && id in TARIFFS ? TARIFFS[id as TariffId] : null;
}

export function priceOf(tariff: Tariff, currency: Currency): number | null {
  return tariff.prices[currency] ?? null;
}
