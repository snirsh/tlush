/**
 * Same-origin market lookup: GET /api/quote. A Vercel function (Web-standard
 * handler, Node runtime) that forwards only a ticker, a date range or a search
 * text to Yahoo Finance and returns a minimal JSON body. Nothing is logged.
 *
 * This is the only place that converts Tel Aviv prices from agorot ("ILA") to
 * shekels: every price and close it returns is in major units, and an "ILA"
 * listing comes back as currency "ILS".
 */

export interface QuoteBody {
  symbol: string;
  price: number;
  currency: string;
}

export interface HistoryBody {
  symbol: string;
  currency: string;
  timestamps: number[];
  closes: (number | null)[];
}

export interface SearchMatch {
  symbol: string;
  name: string;
  exchange: string;
}

export interface SearchBody {
  matches: SearchMatch[];
}

type Query =
  | { mode: "quote"; symbol: string }
  | { mode: "history"; symbol: string; period1: number; period2: number }
  | { mode: "search"; q: string };

type Upstream = (url: string, init: RequestInit) => Promise<Response>;

const SYMBOL = /^[A-Za-z0-9.^=-]{1,15}$/;
const UNIX_SECONDS = /^\d{1,10}$/;
const SEARCH_TEXT = /^[\p{L}\p{M}\p{N}\p{P}\p{S} ]{1,40}$/u;
const EARLIEST = Date.UTC(1990, 0, 1) / 1000;
const DAY = 86_400;
const MAX_SPAN = 400 * DAY;

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const ATTEMPT_MS = 6_000;
const BUDGET_MS = 8_000;
// Yahoo answers 429 to a full Chrome User-Agent sent from Node on a fresh
// connection; the bare browser token gets 200.
const HEADERS = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };

const CACHE = {
  quote: "public, s-maxage=60, stale-while-revalidate=300",
  history: "public, s-maxage=86400, stale-while-revalidate=604800",
  search: "public, s-maxage=86400, stale-while-revalidate=604800",
} as const;

const PARAMS: Record<Query["mode"], string[]> = {
  quote: ["symbol"],
  history: ["period1", "period2", "symbol"],
  search: ["q"],
};

/**
 * The one spelling of a search text: trimmed, inner whitespace collapsed to one
 * space, lower case. The client sends this form so equivalent searches share a
 * CDN cache entry; the function applies it again before forwarding.
 */
export function normalizeSearch(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The query as exactly one mode's parameters, each valid, or null. */
function parseQuery(params: URLSearchParams, nowMs: number): Query | null {
  const keys = [...params.keys()].sort();
  const mode = (Object.keys(PARAMS) as Query["mode"][]).find(
    (m) => PARAMS[m].join() === keys.join(),
  );
  if (!mode) return null;
  const get = (key: string) => params.get(key) ?? "";

  if (mode === "search") {
    const q = normalizeSearch(get("q"));
    return SEARCH_TEXT.test(q) ? { mode, q } : null;
  }
  const symbol = get("symbol");
  if (!SYMBOL.test(symbol)) return null;
  if (mode === "quote") return { mode, symbol };

  if (!UNIX_SECONDS.test(get("period1")) || !UNIX_SECONDS.test(get("period2"))) return null;
  const period1 = Number(get("period1"));
  const period2 = Number(get("period2"));
  const ok =
    period1 >= EARLIEST &&
    period1 < period2 &&
    period2 <= nowMs / 1000 + DAY &&
    period2 - period1 <= MAX_SPAN;
  return ok ? { mode, symbol, period1, period2 } : null;
}

function upstreamPath(query: Query): string {
  switch (query.mode) {
    case "quote":
      return `/v8/finance/chart/${encodeURIComponent(query.symbol)}?range=1d&interval=1d`;
    case "history":
      return `/v8/finance/chart/${encodeURIComponent(query.symbol)}?period1=${query.period1}&period2=${query.period2}&interval=1d`;
    case "search":
      return `/v1/finance/search?q=${encodeURIComponent(query.q)}&quotesCount=8&newsCount=0`;
  }
}

interface YahooChart {
  chart?: {
    result?: {
      meta?: { regularMarketPrice?: unknown; currency?: unknown; symbol?: unknown };
      timestamp?: unknown;
      indicators?: { quote?: { close?: unknown }[] };
    }[];
  };
}

interface YahooSearch {
  quotes?: {
    symbol?: unknown;
    shortname?: unknown;
    longname?: unknown;
    exchDisp?: unknown;
    quoteType?: unknown;
  }[];
}

const isPrice = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
const text = (x: unknown): string | undefined => (typeof x === "string" && x ? x : undefined);

function inMajorUnits(currency: string | undefined): { currency: string; scale: number } {
  if (currency === "ILA") return { currency: "ILS", scale: 100 };
  return { currency: currency ?? "USD", scale: 1 };
}

/** The response body for this query from Yahoo's JSON, or null if it holds no data. */
function toBody(query: Query, json: unknown): QuoteBody | HistoryBody | SearchBody | null {
  if (query.mode === "search") {
    const matches = ((json as YahooSearch)?.quotes ?? []).flatMap((x) => {
      const symbol = text(x.symbol);
      if (!symbol || !SYMBOL.test(symbol) || (x.quoteType !== "EQUITY" && x.quoteType !== "ETF")) return [];
      return [{ symbol, name: text(x.longname) ?? text(x.shortname) ?? symbol, exchange: text(x.exchDisp) ?? "" }];
    });
    return { matches };
  }

  const result = (json as YahooChart)?.chart?.result?.[0];
  const symbol = text(result?.meta?.symbol) ?? query.symbol;
  const { currency, scale } = inMajorUnits(text(result?.meta?.currency));

  if (query.mode === "quote") {
    const price = result?.meta?.regularMarketPrice;
    return isPrice(price) ? { symbol, price: price / scale, currency } : null;
  }

  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length === 0) return null;
  if (timestamps.length !== closes.length || !timestamps.every(Number.isInteger)) return null;
  return {
    symbol,
    currency,
    timestamps,
    closes: closes.map((c) => (isPrice(c) ? c / scale : null)),
  };
}

type Fetched = { kind: "json"; json: unknown } | { kind: "missing" } | { kind: "failed" };

/** query1, then query2 when query1 errors, times out or answers anything but 2xx, 400 or 404. */
async function fromYahoo(path: string, upstream: Upstream): Promise<Fetched> {
  const deadline = Date.now() + BUDGET_MS;
  for (const host of HOSTS) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    try {
      const res = await upstream(`${host}${path}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(Math.min(ATTEMPT_MS, left)),
      });
      if (res.status === 404 || res.status === 400) return { kind: "missing" };
      if (res.ok) return { kind: "json", json: await res.json() };
    } catch {
      // Network error, timeout or a non-JSON body: try the next host.
    }
  }
  return { kind: "failed" };
}

function json(status: number, body: unknown, cacheControl = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cacheControl },
  });
}

export async function handle(request: Request, upstream: Upstream = fetch): Promise<Response> {
  const query = parseQuery(new URL(request.url).searchParams, Date.now());
  if (!query) return json(400, { error: "bad_request" });

  const fetched = await fromYahoo(upstreamPath(query), upstream);
  if (fetched.kind === "failed") return json(502, { error: "upstream" });
  const body = fetched.kind === "json" ? toBody(query, fetched.json) : null;
  if (!body) return json(404, { error: "not_found" });
  return json(200, body, CACHE[query.mode]);
}

export function GET(request: Request): Promise<Response> {
  return handle(request);
}
