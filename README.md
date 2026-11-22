# Tlush

*Israeli RSU & ESPP after-tax calculator — Section 102 capital track.*

A free, open-source calculator that estimates your **after-tax proceeds** when
selling **RSUs** or **ESPP** shares in Israel under **Section 102** of the Income
Tax Ordinance (capital track). It handles the income/capital split, marginal
income tax, Bituah Leumi & health, capital-gains tax, surtax (*mas yesef*),
broker/trustee fees, dual-currency capital methods, and miluim/maternity tips.

All the math runs **in your browser**: no account, and **no personal data is
stored or transmitted**. The only server involved is a tiny price lookup
(`api/quote.ts`). It receives a ticker, a date range or a search text, never
your salary or any other input, and asks Yahoo Finance on your behalf.

## Features

- **RSU calculator** — up to 8 grants combined, Section 102 capital track, the
  2-year holding rule, "what if 2 years pass", per-grant workplace handling, and
  the 2-year break-even price.
- **ESPP calculator** — with/without trustee, dual-currency capital-gain methods,
  loss handling (*Magen Mas*).
- **Live & automatic** — the USD/ILS exchange rate (frankfurter.app or
  open.er-api.com, straight from the browser), stock prices, and the grant-date
  30-day average price (Yahoo Finance via our `/api/quote` function), with
  **manual overrides** for every value (so it works offline too).
- **Symbol autocomplete** for US (NASDAQ/NYSE) and Tel-Aviv (`.TA`) listings.
- **Current Israeli tax brackets, Bituah Leumi rates and ceilings**, selectable
  by year and centralized in one file.
- An in-app **Explanation** tab documenting every field and result row.

## Quick start

```bash
bun install
bun run dev      # http://localhost:5173
```

```bash
bun run test     # run the tax-engine test suite
bun run build    # production build → dist/
```

## Deploying to GitHub Pages

1. Push to `master`.
2. In the repo settings, set **Pages → Build and deployment → Source** to
   **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds and publishes
   automatically. The app is served at `https://<owner>.github.io/<repo>/`.

For a user/organization page (served at the domain root), set `BASE_PATH=/` in
the build step.

GitHub Pages serves static files only, so the `/api/quote` price lookup isn't
there. Live prices and live symbol search need a Vercel deployment (framework
preset "Vite"; `api/quote.ts` deploys as a function with no configuration).
Without it, enter prices by hand; autocomplete uses the bundled ticker list.

## How the tax math works

See [`CLAUDE.md`](./CLAUDE.md) for architecture, and `src/lib/tax/` for the pure
calculation engine. Tax constants live in `src/lib/tax/constants.ts` — update
that one file each tax year. Worked examples — derived from first principles
using the published statutory rates — are encoded as regression tests in
`src/lib/tax/__tests__/examples.test.ts`.

## Disclaimer

This tool is for **educational purposes only** and is **not legal, financial or
tax advice**. Tax rules change and individual situations vary — verify any figure
with a licensed Israeli tax adviser before acting on it.

## License

MIT — see [`LICENSE`](./LICENSE).
