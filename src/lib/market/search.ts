import { normalizeSearch, type SearchBody, type SearchMatch } from "../../../api/quote";
import { fetchApi } from "./http";

export type SymbolMatch = SearchMatch;

let bundledCache: SymbolMatch[] | null = null;

/** Load the bundled offline ticker list (served from the app base path). */
async function loadBundled(): Promise<SymbolMatch[]> {
  if (bundledCache) return bundledCache;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}tickers.json`);
    bundledCache = (await res.json()) as SymbolMatch[];
  } catch {
    bundledCache = [];
  }
  return bundledCache;
}

function filterBundled(list: SymbolMatch[], query: string): SymbolMatch[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return list
    .filter(
      (m) =>
        m.symbol.toUpperCase().includes(q) ||
        m.name.toUpperCase().includes(q),
    )
    .slice(0, 8);
}

/**
 * Symbol autocomplete. Tries the live search behind /api/quote first, then the
 * bundled offline list, so suggestions still work without network access.
 */
export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const live = (await fetchApi<SearchBody>({ q: normalizeSearch(q) }))?.matches;
  if (Array.isArray(live) && live.length > 0) return live;

  return filterBundled(await loadBundled(), q);
}
