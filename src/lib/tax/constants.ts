import type { SaleFees, YearConstants } from "./types";
import { TAX_YEAR_SPECS } from "./years";

// Per-year tax figures live in `years/<year>.ts`, one spec per tax year.
export const YEARS: Record<number, YearConstants> = Object.fromEntries(
  TAX_YEAR_SPECS.map((spec) => [spec.year, spec]),
);

export const SUPPORTED_YEARS = Object.keys(YEARS)
  .map(Number)
  .sort((a, b) => a - b);

export function yearConstants(year: number): YearConstants {
  const spec = YEARS[year];
  if (!spec) {
    throw new RangeError(
      `Unsupported tax year ${year}. Supported years: ${SUPPORTED_YEARS.join(", ")}.`,
    );
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Default broker / trustee sale fees. Users can override each of these per
// grant. Ranges accepted by the UI: foreign 0.01%–0.10%, service 0.03%–0.60%,
// wire 0–50, conversion 0%–2%.
// ---------------------------------------------------------------------------
export const DEFAULT_FEES: SaleFees = {
  foreignFee: 0.0007, // 0.07%
  serviceFee: 0.006, // 0.60%
  wireFee: 20, // flat, in the sale currency
  conversionFee: 0.0, // applied only when converting USD→ILS via trustee
};

/** The number of capital-track holding years required by Section 102. */
export const SECTION_102_HOLDING_YEARS = 2;
