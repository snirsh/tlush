import { useEffect, useRef } from "react";
import { money } from "../lib/format";
import type { Quote } from "../lib/market/quote";
import { useDebounced } from "./ui";

/** One best-effort market lookup, for the `key` it was asked about. */
export type Lookup<T> =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ok"; key: string; value: T }
  | { status: "failed"; key: string };

export const IDLE: Lookup<never> = { status: "idle" };

/**
 * Looks `key` up once it stops changing ("" means nothing to look up) and
 * reports every state. Only the latest key's answer is ever reported, so a
 * slow reply for a symbol the user has typed past is dropped.
 */
export function useLookup<T>(
  key: string,
  run: (key: string) => Promise<T | null>,
  report: (lookup: Lookup<T>) => void,
): void {
  const settled = useDebounced(key, 300);
  const latest = useRef({ run, report });
  useEffect(() => {
    latest.current = { run, report };
  });
  useEffect(() => {
    const { run, report } = latest.current;
    if (!settled) {
      report(IDLE);
      return;
    }
    let active = true;
    report({ status: "loading", key: settled });
    run(settled).then((value) => {
      if (!active) return;
      report(value === null ? { status: "failed", key: settled } : { status: "ok", key: settled, value });
    });
    return () => {
      active = false;
    };
  }, [settled]);
}

export const liveQuote = (q: Lookup<Quote>): Quote | null => (q.status === "ok" ? q.value : null);

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
