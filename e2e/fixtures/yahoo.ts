/**
 * A stand-in for Yahoo Finance, used by `vite preview` under TLUSH_YAHOO_FIXTURES=1
 * so e2e never touches the network. Synthetic figures: WIX trades at $150 and
 * closed at $100 on every day before any grant date; POLI.TA trades at 1,234 agorot.
 */
const CHARTS: Record<string, { currency: string; price: number; close: number }> = {
  WIX: { currency: "USD", price: 150, close: 100 },
  "POLI.TA": { currency: "ILA", price: 1234, close: 1200 },
};

const SEARCH = [
  { symbol: "WIX", shortname: "Wix (fixture)", exchDisp: "NASDAQ", quoteType: "EQUITY" },
  { symbol: "WIX250117C00100000", shortname: "WIX option", exchDisp: "OPR", quoteType: "OPTION" },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function fixtureYahoo(url: string): Promise<Response> {
  const { pathname, searchParams } = new URL(url);
  if (pathname === "/v1/finance/search") {
    const q = (searchParams.get("q") ?? "").toUpperCase();
    return json({ quotes: SEARCH.filter((s) => s.symbol.startsWith(q)) });
  }
  const chart = CHARTS[decodeURIComponent(pathname.replace("/v8/finance/chart/", ""))];
  if (!chart) return json({ chart: { result: null, error: { code: "Not Found" } } }, 404);
  const symbol = decodeURIComponent(pathname.split("/").pop() ?? "");
  const meta = { symbol, currency: chart.currency, regularMarketPrice: chart.price };
  const period2 = Number(searchParams.get("period2"));
  if (!period2) return json({ chart: { result: [{ meta }] } });
  const timestamps = Array.from({ length: 30 }, (_, i) => period2 - (30 - i) * 86_400);
  return json({
    chart: { result: [{ meta, timestamp: timestamps, indicators: { quote: [{ close: timestamps.map(() => chart.close) }] } }] },
  });
}
