import { useEffect, useRef } from "react";
import { money } from "../lib/format";
import type { Quote } from "../lib/market/quote";

/** One best-effort market lookup, for the `key` it was asked about (symbol, or symbol and date). */
export type Lookup<T> =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ok"; key: string; value: T }
  | { status: "failed"; key: string };

export const IDLE: Lookup<never> = { status: "idle" };

/**
 * The stored lookup as it stands for the input on screen. An answer counts
 * only for the key it was asked about; any other key is still pending.
 */
export function lookupFor<T>(stored: Lookup<T>, key: string): Lookup<T> {
  if (!key) return IDLE;
  return stored.status !== "idle" && stored.key === key ? stored : { status: "loading", key };
}

/**
 * Looks `key` up once it has stopped changing for a moment ("" means nothing
 * to look up) and reports the answer. A key change cancels both the pending
 * lookup and any reply still in flight.
 */
export function useLookup<T>(
  key: string,
  run: (key: string) => Promise<T | null>,
  report: (lookup: Lookup<T>) => void,
): void {
  const latest = useRef({ run, report });
  useEffect(() => {
    latest.current = { run, report };
  });
  useEffect(() => {
    if (!key) return;
    let active = true;
    const timer = setTimeout(() => {
      latest.current.run(key).then((value) => {
        if (!active) return;
        latest.current.report(value === null ? { status: "failed", key } : { status: "ok", key, value });
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);
}

export const liveQuote = (q: Lookup<Quote>): Quote | null => (q.status === "ok" ? q.value : null);

export const NO_PRICE_YET = "Enter the stock price and your after-tax breakdown appears here.";

/** The line under "Set stock price": what the live lookup did, and what to do next. */
export function quoteStatus(q: Lookup<Quote>, manual: boolean): string {
  switch (q.status) {
    case "idle":
      return manual ? "" : "Enter a symbol, or turn on “Set stock price”.";
    case "loading":
      return manual ? "" : "Fetching price…";
    case "ok":
      return manual ? "" : `Live price: ${money(q.value.price, q.value.isTase ? "ILS" : "USD")}`;
    case "failed":
      return `Couldn't fetch the live price for ${q.key}. ${
        manual ? "Enter it below." : "Turn on “Set stock price” to enter it."
      }`;
  }
}
