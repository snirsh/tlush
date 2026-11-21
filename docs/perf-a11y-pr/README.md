# Perf + a11y PR: visual-parity evidence

Each `*-compare.png` shows three panels: master (0264d7a) | this PR | changed pixels (any pixel difference, in red).

How these were made:
- Local production build of each commit, served by `vite preview`, rendered by Chromium 1255 on Linux.
- Market and FX hosts are blocked, so the numbers are deterministic.
- Captures are full page at 1440×900 and 390×844.
- The `*-filled-*` captures are taken with a synthetic RSU grant (₪25,000/mo, 100 shares, $120 → $180, fx 3.7) and an ESPP grant entered.

Two runs of master against itself differ by 0 px, so every red pixel is a real change.

Expected changes, and the only ones found:
- **`--ink-3` hint text, #6a6f77 → #81868e.** This is for 4.5:1 contrast. See `ink3-contrast-zoom.png`.
- **The Tax year `<select>` text ("2026") moves by a sub-pixel.** This causes about 100 px of anti-aliasing difference. The layout and size are the same.
