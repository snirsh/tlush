import type { HistoryBody, QuoteBody } from "../../../api/quote";
import { fetchApi } from "./http";

export interface Quote {
  symbol: string;
  /** In shekels for Tel Aviv listings: /api/quote converts agorot. */
  price: number;
  currency: string;
  /** True for Tel-Aviv (.TA) listings, which are priced in ILS. */
  isTase: boolean;
}

export function isTaseSymbol(symbol: string): boolean {
  return symbol.toUpperCase().endsWith(".TA");
}

/** Latest price for a symbol, or null if unavailable (user can override). */
export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const body = await fetchApi<QuoteBody>({ symbol });
  if (typeof body?.price !== "number") return null;
  return { symbol: body.symbol, price: body.price, currency: body.currency, isTase: isTaseSymbol(symbol) };
}

/**
 * Average closing price over the ~30 trading days before a grant date — the
 * Section 102 grant-price basis. Returns null if history is unavailable.
 */
export async function fetchGrantPrice(symbol: string, grantDate: Date): Promise<number | null> {
  const period2 = Math.floor(grantDate.getTime() / 1000);
  // Reach back ~50 calendar days to capture ~30 trading days.
  const period1 = period2 - 50 * 24 * 60 * 60;
  const body = await fetchApi<HistoryBody>({ symbol, period1: String(period1), period2: String(period2) });
  if (!Array.isArray(body?.closes)) return null;
  const valid = body.closes.filter((c): c is number => typeof c === "number").slice(-30);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
