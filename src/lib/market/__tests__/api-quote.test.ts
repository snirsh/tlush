import { describe, expect, it, vi } from "vitest";
import { handle } from "../../../../api/quote";

const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);
const JAN_15_2024 = Date.UTC(2024, 0, 15) / 1000;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const chart = (meta: object, timestamp?: number[], close?: (number | null)[]) =>
  ok({ chart: { result: [{ meta, timestamp, indicators: { quote: [{ close }] } }] } });

/** Run the handler against a fake Yahoo; returns the response, its JSON and every upstream URL. */
async function call(query: string, yahoo: (url: string) => Promise<Response> = async () => ok({})) {
  const upstream = vi.fn(yahoo);
  const res = await handle(new Request(`http://localhost/api/quote?${query}`), upstream);
  return { res, body: await res.json(), urls: upstream.mock.calls.map(([u]) => u) };
}

describe("validation", () => {
  it.each([
    "",
    "symbol=",
    "symbol=WIX%20LTD",
    "symbol=WIX/../x",
    "symbol=ABCDEFGHIJKLMNOP",
    "symbol=WIX&symbol=TEVA",
    "symbol=WIX&salary=30000",
    "q=",
    "q=%20%20",
    `q=${"a".repeat(41)}`,
    "q=wix%00d",
    "q=wix&symbol=WIX",
    `symbol=WIX&period1=${JAN_15_2024}`,
    `symbol=WIX&period1=${JAN_15_2024}&period2=${JAN_15_2024}`,
    `symbol=WIX&period1=${JAN_15_2024 + DAY}&period2=${JAN_15_2024}`,
    `symbol=WIX&period1=${JAN_15_2024}.5&period2=${JAN_15_2024 + DAY}`,
    `symbol=WIX&period1=-1&period2=${JAN_15_2024}`,
    `symbol=WIX&period1=${Date.UTC(1989, 11, 31) / 1000}&period2=${Date.UTC(1990, 1, 1) / 1000}`,
    `symbol=WIX&period1=${now()}&period2=${now() + 2 * DAY}`,
    `symbol=WIX&period1=${JAN_15_2024 - 401 * DAY}&period2=${JAN_15_2024}`,
  ])("rejects %j with 400 and never calls Yahoo", async (query) => {
    const { res, body, urls } = await call(query);
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "bad_request" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(urls).toEqual([]);
  });

  it.each(["WIX", "POLI.TA", "^GSPC", "BRK-B", "EURUSD=X", "wix"])("accepts the symbol %s", async (symbol) => {
    const { res } = await call(`symbol=${encodeURIComponent(symbol)}`, async () => chart({ regularMarketPrice: 1 }));
    expect(res.status).toBe(200);
  });

  it("accepts a 400-day history window ending tomorrow", async () => {
    const period2 = now() + DAY - 60;
    const { res } = await call(`symbol=WIX&period1=${period2 - 400 * DAY}&period2=${period2}`, async () =>
      chart({}, [period2], [1]),
    );
    expect(res.status).toBe(200);
  });

  it.each([
    ["  טבע ", "טבע"],
    ["  Wix.COM \t  Ltd\n", "wix.com ltd"],
    [`${"A".repeat(20)}    ${"B".repeat(19)}`, `${"a".repeat(20)} ${"b".repeat(19)}`],
  ])("forwards %j as %j", async (text, forwarded) => {
    const { res, urls } = await call(`q=${encodeURIComponent(text)}`, async () => ok({ quotes: [] }));
    expect(res.status).toBe(200);
    expect(new URL(urls[0]).searchParams.get("q")).toBe(forwarded);
  });
});

describe("quote", () => {
  it("returns only symbol, price and currency, cached for a minute", async () => {
    const { res, body, urls } = await call("symbol=WIX", async () =>
      chart({ symbol: "WIX", currency: "USD", regularMarketPrice: 151.25, longName: "Wix" }),
    );
    expect(body).toEqual({ symbol: "WIX", price: 151.25, currency: "USD" });
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(urls).toEqual(["https://query1.finance.yahoo.com/v8/finance/chart/WIX?range=1d&interval=1d"]);
  });

  it("converts Tel Aviv agorot to shekels", async () => {
    const { body } = await call("symbol=POLI.TA", async () =>
      chart({ symbol: "POLI.TA", currency: "ILA", regularMarketPrice: 4567 }),
    );
    expect(body).toEqual({ symbol: "POLI.TA", price: 45.67, currency: "ILS" });
  });

  it.each([
    ["Yahoo answers 404", async () => new Response("{}", { status: 404 })],
    ["the chart has no price", async () => chart({ symbol: "WIX" })],
    ["the chart has no result", async () => ok({ chart: { result: null } })],
  ])("is 404 when %s", async (_, yahoo) => {
    const { res, body } = await call("symbol=NOPE", yahoo);
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "not_found" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("history", () => {
  it("returns timestamps and closes in shekels, cached for a day", async () => {
    const t = [JAN_15_2024 - 2 * DAY, JAN_15_2024 - DAY];
    const { res, body, urls } = await call(`symbol=POLI.TA&period1=${JAN_15_2024 - 50 * DAY}&period2=${JAN_15_2024}`, async () =>
      chart({ symbol: "POLI.TA", currency: "ILA" }, t, [3000, null]),
    );
    expect(body).toEqual({ symbol: "POLI.TA", currency: "ILS", timestamps: t, closes: [30, null] });
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
    expect(urls).toEqual([
      `https://query1.finance.yahoo.com/v8/finance/chart/POLI.TA?period1=${JAN_15_2024 - 50 * DAY}&period2=${JAN_15_2024}&interval=1d`,
    ]);
  });

  it("is 404 when the range has no trading days", async () => {
    const { res } = await call(`symbol=WIX&period1=${JAN_15_2024 - DAY}&period2=${JAN_15_2024}`, async () =>
      chart({ symbol: "WIX" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("search", () => {
  it("keeps equities and ETFs only, with minimal fields, cached for a day", async () => {
    const { res, body } = await call("q=wix", async () =>
      ok({
        quotes: [
          { symbol: "WIX", shortname: "Wix.com", longname: "Wix.com Ltd.", exchDisp: "NASDAQ", quoteType: "EQUITY", score: 1 },
          { symbol: "SPY", shortname: "SPDR S&P 500", exchDisp: "NYSE Arca", quoteType: "ETF" },
          { symbol: "WIX250117C00100000", exchDisp: "OPR", quoteType: "OPTION" },
          { symbol: "has space", quoteType: "EQUITY" },
          { shortname: "no symbol", quoteType: "EQUITY" },
        ],
        news: [{ title: "x" }],
      }),
    );
    expect(body).toEqual({
      matches: [
        { symbol: "WIX", name: "Wix.com Ltd.", exchange: "NASDAQ" },
        { symbol: "SPY", name: "SPDR S&P 500", exchange: "NYSE Arca" },
      ],
    });
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
  });

  it("answers an empty list with 200", async () => {
    const { res, body } = await call("q=zzzz", async () => ok({ quotes: [] }));
    expect(res.status).toBe(200);
    expect(body).toEqual({ matches: [] });
  });
});

describe("upstream", () => {
  it("sends the bare browser User-Agent (a full Chrome one gets 429 from Node) and a timeout signal", async () => {
    const upstream = vi.fn(async (_url: string, _init: RequestInit) => chart({ regularMarketPrice: 1 }));
    await handle(new Request("http://localhost/api/quote?symbol=WIX"), upstream);
    const init = upstream.mock.calls[0][1];
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Mozilla/5.0");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["throws", async () => Promise.reject(new TypeError("fetch failed"))],
    ["answers 429", async () => new Response("Too Many Requests", { status: 429 })],
    ["answers HTML", async () => new Response("<html>", { status: 200 })],
  ])("falls back to query2 when query1 %s", async (_, query1) => {
    const { body, urls } = await call("symbol=WIX", async (url) =>
      url.startsWith("https://query1.") ? query1() : chart({ symbol: "WIX", currency: "USD", regularMarketPrice: 2 }),
    );
    expect(body).toEqual({ symbol: "WIX", price: 2, currency: "USD" });
    expect(urls.map((u) => new URL(u).host)).toEqual(["query1.finance.yahoo.com", "query2.finance.yahoo.com"]);
  });

  it.each([
    ["the symbol is unknown", "symbol=NOPE", 404],
    ["it can't search the text", `q=${encodeURIComponent("טבע")}`, 400],
  ])("is 404 without trying query2 when query1 says %s", async (_, query, status) => {
    const { res, urls } = await call(query, async () => new Response("{}", { status }));
    expect(res.status).toBe(404);
    expect(urls).toHaveLength(1);
  });

  it("is 502 without echoing Yahoo when both hosts fail", async () => {
    const { res, body } = await call("symbol=WIX", async () => new Response("secret upstream detail", { status: 503 }));
    expect(res.status).toBe(502);
    expect(body).toEqual({ error: "upstream" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
