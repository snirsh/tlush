// Best-effort fetches for the market-data layer. Every market value (FX rate,
// stock price, grant price) has a manual override in the UI, so these fail soft
// and never throw to the UI.

/** GET a URL as JSON, or null on any network error, timeout or non-2xx answer. */
export async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Our own /api/quote function (api/quote.ts), same origin. The query carries
 * only a ticker, a date range or a search text, never any calculator input.
 */
export function fetchApi<T>(params: Record<string, string>): Promise<T | null> {
  return fetchJson<T>(`${import.meta.env.BASE_URL}api/quote?${new URLSearchParams(params)}`);
}
