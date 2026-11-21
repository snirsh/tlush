import { describe, expect, it } from "vitest";
import { SUPPORTED_YEARS, yearConstants } from "../constants";
import { annualIncomeTax, marginalRateAt } from "../income";
import { bituahOnMonthlySlice } from "../bituah";

// Expected values are the published statutory figures (see years/README.md),
// written out by hand rather than read back from the specs under test.

const FROZEN_BRACKETS = [
  { upTo: 84_120, rate: 0.1 },
  { upTo: 120_720, rate: 0.14 },
  { upTo: 193_800, rate: 0.2 },
  { upTo: 269_280, rate: 0.31 },
  { upTo: 560_280, rate: 0.35 },
  { upTo: Infinity, rate: 0.47 },
];

const BRACKETS_2026 = [
  { upTo: 84_120, rate: 0.1 },
  { upTo: 120_720, rate: 0.14 },
  { upTo: 228_000, rate: 0.2 },
  { upTo: 301_200, rate: 0.31 },
  { upTo: 560_280, rate: 0.35 },
  { upTo: Infinity, rate: 0.47 },
];

const EXPECTED = {
  2024: {
    brackets: FROZEN_BRACKETS,
    nationalInsurance: { reducedThresholdMonthly: 7_522, reducedRate: 0.035, fullRate: 0.12, ceilingMonthly: 49_030 },
    surtax: { thresholdAnnual: 721_560, rate: 0.03, capitalExtraRate: 0 },
    section102CapitalRate: 0.25,
  },
  2025: {
    brackets: FROZEN_BRACKETS,
    nationalInsurance: { reducedThresholdMonthly: 7_522, reducedRate: 0.0427, fullRate: 0.1217, ceilingMonthly: 50_695 },
    surtax: { thresholdAnnual: 721_560, rate: 0.03, capitalExtraRate: 0.02 },
    section102CapitalRate: 0.25,
  },
  2026: {
    brackets: BRACKETS_2026,
    nationalInsurance: { reducedThresholdMonthly: 7_703, reducedRate: 0.0427, fullRate: 0.1217, ceilingMonthly: 51_910 },
    surtax: { thresholdAnnual: 721_560, rate: 0.03, capitalExtraRate: 0.02 },
    section102CapitalRate: 0.25,
  },
} as const;

describe("year specs", () => {
  it("supports exactly 2024, 2025 and 2026", () => {
    expect(SUPPORTED_YEARS).toEqual([2024, 2025, 2026]);
  });

  it.each(SUPPORTED_YEARS)("%i matches the published figures", (year) => {
    const spec = yearConstants(year);
    const expected = EXPECTED[year as keyof typeof EXPECTED];
    expect(spec.year).toBe(year);
    expect(spec.incomeTax.brackets).toEqual(expected.brackets);
    expect(spec.nationalInsurance).toEqual(expected.nationalInsurance);
    expect(spec.surtax).toEqual(expected.surtax);
    expect(spec.capitalGains.section102CapitalRate).toBe(expected.section102CapitalRate);
  });
});

describe("annualIncomeTax at representative incomes", () => {
  // Cumulative tax at each bracket top, 2024/2025:
  //   84,120 → 8,412 | 120,720 → 13,536 | 193,800 → 28,152
  //   269,280 → 51,550.80 | 560,280 → 153,400.80
  // 2026:
  //   84,120 → 8,412 | 120,720 → 13,536 | 228,000 → 34,992
  //   301,200 → 57,684 | 560,280 → 148,362
  it.each([
    // year, income, tax, derivation
    [2024, 60_000, 6_000], //            60,000 × 10%
    [2024, 150_000, 19_392], //          13,536 + 29,280 × 20%
    [2024, 250_000, 45_574], //          28,152 + 56,200 × 31%
    [2024, 400_000, 97_302.8], //        51,550.80 + 130,720 × 35%
    [2024, 800_000, 266_069.2], //       153,400.80 + 239,720 × 47%
    [2025, 60_000, 6_000],
    [2025, 150_000, 19_392],
    [2025, 250_000, 45_574],
    [2025, 400_000, 97_302.8],
    [2025, 800_000, 266_069.2],
    [2026, 60_000, 6_000], //            60,000 × 10%
    [2026, 150_000, 19_392], //          13,536 + 29,280 × 20%
    [2026, 250_000, 41_812], //          34,992 + 22,000 × 31%
    [2026, 400_000, 92_264], //          57,684 + 98,800 × 35%
    [2026, 800_000, 261_030.4], //       148,362 + 239,720 × 47%
  ])("%i: tax on ₪%i is ₪%f", (year, income, tax) => {
    expect(annualIncomeTax(income, yearConstants(year))).toBeCloseTo(tax, 2);
  });
});

describe("bracket edges (edge − 1, edge, edge + 1)", () => {
  // [year, edge, cumulative tax at the edge, rate below, rate above]
  const edges: [number, number, number, number, number][] = [
    [2024, 84_120, 8_412, 0.1, 0.14],
    [2024, 120_720, 13_536, 0.14, 0.2],
    [2024, 193_800, 28_152, 0.2, 0.31],
    [2024, 269_280, 51_550.8, 0.31, 0.35],
    [2024, 560_280, 153_400.8, 0.35, 0.47],
    [2025, 84_120, 8_412, 0.1, 0.14],
    [2025, 120_720, 13_536, 0.14, 0.2],
    [2025, 193_800, 28_152, 0.2, 0.31],
    [2025, 269_280, 51_550.8, 0.31, 0.35],
    [2025, 560_280, 153_400.8, 0.35, 0.47],
    [2026, 84_120, 8_412, 0.1, 0.14],
    [2026, 120_720, 13_536, 0.14, 0.2],
    [2026, 228_000, 34_992, 0.2, 0.31],
    [2026, 301_200, 57_684, 0.31, 0.35],
    [2026, 560_280, 148_362, 0.35, 0.47],
  ];

  it.each(edges)("%i edge ₪%i", (year, edge, taxAtEdge, below, above) => {
    const yc = yearConstants(year);
    expect(annualIncomeTax(edge - 1, yc)).toBeCloseTo(taxAtEdge - below, 6);
    expect(annualIncomeTax(edge, yc)).toBeCloseTo(taxAtEdge, 6);
    expect(annualIncomeTax(edge + 1, yc)).toBeCloseTo(taxAtEdge + above, 6);
    // A bracket's upper bound is inclusive, so the edge itself is still taxed below.
    expect(marginalRateAt(edge - 1, yc)).toBe(below);
    expect(marginalRateAt(edge, yc)).toBe(below);
    expect(marginalRateAt(edge + 1, yc)).toBe(above);
  });
});

describe("Bituah Leumi band edges (₪1 slice on top of a salary)", () => {
  // [year, reduced threshold, ceiling, reduced rate, full rate]
  const bands: [number, number, number, number, number][] = [
    [2024, 7_522, 49_030, 0.035, 0.12],
    [2025, 7_522, 50_695, 0.0427, 0.1217],
    [2026, 7_703, 51_910, 0.0427, 0.1217],
  ];

  it.each(bands)("%i: reduced threshold ₪%i", (year, threshold, _ceiling, reduced, full) => {
    const yc = yearConstants(year);
    // The ₪1 between threshold − 1 and threshold is the last reduced-rate shekel.
    expect(bituahOnMonthlySlice(threshold - 1, 1, yc)).toBeCloseTo(reduced, 10);
    expect(bituahOnMonthlySlice(threshold, 1, yc)).toBeCloseTo(full, 10);
    expect(bituahOnMonthlySlice(threshold + 1, 1, yc)).toBeCloseTo(full, 10);
    // A ₪2 slice from threshold − 1 straddles both bands.
    expect(bituahOnMonthlySlice(threshold - 1, 2, yc)).toBeCloseTo(reduced + full, 10);
  });

  it.each(bands)("%i: ceiling ₪%i", (year, _threshold, ceiling, _reduced, full) => {
    const yc = yearConstants(year);
    expect(bituahOnMonthlySlice(ceiling - 1, 1, yc)).toBeCloseTo(full, 10);
    expect(bituahOnMonthlySlice(ceiling, 1, yc)).toBe(0);
    expect(bituahOnMonthlySlice(ceiling + 1, 1, yc)).toBe(0);
    // A ₪2 slice from ceiling − 1 counts only the shekel below the ceiling.
    expect(bituahOnMonthlySlice(ceiling - 1, 2, yc)).toBeCloseTo(full, 10);
  });
});
