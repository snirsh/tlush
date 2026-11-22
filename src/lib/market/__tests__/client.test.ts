import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGrantPrice, fetchQuote } from "../quote";
import { searchSymbols } from "../search";

const JAN_15_2024 = new Date("2024-01-15T00:00:00Z");

/** Stub fetch with a per-URL answer; returns the URLs the client asked for. */
function stubFetch(answer: (url: URL) => Response | Promise<Response>) {
  const urls: URL[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(input, "http://localhost");
    urls.push(url);
    return answer(url);
  });
  return urls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const params = (url: URL) => Object.fromEntries(url.searchParams);

afterEach(() => vi.unstubAllGlobals());

describe("fetchQuote", () => {
  it("asks /api/quote for the symbol alone", async () => {
    const urls = stubFetch(() => json({ symbol: "POLI.TA", price: 45.67, currency: "ILS" }));
    expect(await fetchQuote("POLI.TA")).toEqual({ symbol: "POLI.TA", price: 45.67, currency: "ILS", isTase: true });
    expect(urls.map((u) => u.pathname)).toEqual(["/api/quote"]);
    expect(params(urls[0])).toEqual({ symbol: "POLI.TA" });
  });

  it.each([
    ["a 502", () => json({ error: "upstream" }, 502)],
    ["a 404", () => json({ error: "not_found" }, 404)],
    ["a network error", () => Promise.reject(new TypeError("offline"))],
  ])("is null on %s", async (_, answer) => {
    stubFetch(answer);
    expect(await fetchQuote("WIX")).toBeNull();
  });
});

describe("fetchGrantPrice", () => {
  it("asks for the 50 days before the grant date and averages the last 30 closes", async () => {
    const closes = [...Array(5).fill(999), ...Array(29).fill(100), null, 130];
    const urls = stubFetch(() => json({ symbol: "WIX", currency: "USD", timestamps: closes.map((_, i) => i), closes }));
    expect(await fetchGrantPrice("WIX", JAN_15_2024)).toBe(101);
    const period2 = JAN_15_2024.getTime() / 1000;
    expect(params(urls[0])).toEqual({ symbol: "WIX", period1: String(period2 - 50 * 86_400), period2: String(period2) });
  });

  it("is null when the function fails", async () => {
    stubFetch(() => json({ error: "upstream" }, 502));
    expect(await fetchGrantPrice("WIX", JAN_15_2024)).toBeNull();
  });
});

describe("searchSymbols", () => {
  it("asks /api/quote with the trimmed text alone", async () => {
    const urls = stubFetch(() => json({ matches: [{ symbol: "WIX", name: "Wix.com Ltd.", exchange: "NASDAQ" }] }));
    expect(await searchSymbols(" wix ")).toEqual([{ symbol: "WIX", name: "Wix.com Ltd.", exchange: "NASDAQ" }]);
    expect(urls.map((u) => `${u.pathname}?${u.searchParams}`)).toEqual(["/api/quote?q=wix"]);
  });

  it("falls back to the bundled tickers.json when the function fails", async () => {
    const urls = stubFetch((url) =>
      url.pathname === "/tickers.json"
        ? json([
            { symbol: "TEVA", name: "Teva Pharmaceutical", exchange: "NYSE" },
            { symbol: "WIX", name: "Wix.com", exchange: "NASDAQ" },
          ])
        : json({ error: "upstream" }, 502),
    );
    expect(await searchSymbols("teva")).toEqual([{ symbol: "TEVA", name: "Teva Pharmaceutical", exchange: "NYSE" }]);
    expect(urls.map((u) => u.pathname)).toEqual(["/api/quote", "/tickers.json"]);
  });
});
