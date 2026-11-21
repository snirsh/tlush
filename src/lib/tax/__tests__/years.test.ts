import { describe, expect, it } from "vitest";
import { yearConstants } from "../constants";
import { annualIncomeTax } from "../income";
import { bituahOnMonthlySlice } from "../bituah";

describe("Bituah Leumi + health employee rates", () => {
  it("2024 is 3.5% reduced (0.4% + 3.1%) and 12% full (7% + 5%)", () => {
    const ni = yearConstants(2024).nationalInsurance;
    expect(ni.reducedRate).toBeCloseTo(0.004 + 0.031, 10);
    expect(ni.fullRate).toBeCloseTo(0.07 + 0.05, 10);
  });

  it.each([2025, 2026])("%i is 4.27% reduced (1.04% + 3.23%) and 12.17% full (7% + 5.17%)", (year) => {
    const ni = yearConstants(year).nationalInsurance;
    expect(ni.reducedRate).toBeCloseTo(0.0104 + 0.0323, 10);
    expect(ni.fullRate).toBeCloseTo(0.07 + 0.0517, 10);
  });

  it("charges ₪608.50 on a 2025 ₪5,000 slice above a ₪20,000 salary", () => {
    // Whole slice is in the full band: 5,000 × 12.17% = 608.50.
    expect(bituahOnMonthlySlice(20_000, 5_000, yearConstants(2025))).toBeCloseTo(608.5, 2);
  });
});

describe("2026 income-tax brackets (Amendment 288, §121)", () => {
  it("widens the 20% and 31% brackets to 228,000 and 301,200", () => {
    expect(yearConstants(2026).incomeTax.brackets.slice(0, 5)).toEqual([
      { upTo: 84_120, rate: 0.1 },
      { upTo: 120_720, rate: 0.14 },
      { upTo: 228_000, rate: 0.2 },
      { upTo: 301_200, rate: 0.31 },
      { upTo: 560_280, rate: 0.35 },
    ]);
  });

  it("keeps 2024 and 2025 frozen at 193,800 and 269,280", () => {
    for (const year of [2024, 2025]) {
      expect(yearConstants(year).incomeTax.brackets.slice(0, 5)).toEqual([
        { upTo: 84_120, rate: 0.1 },
        { upTo: 120_720, rate: 0.14 },
        { upTo: 193_800, rate: 0.2 },
        { upTo: 269_280, rate: 0.31 },
        { upTo: 560_280, rate: 0.35 },
      ]);
    }
  });

  it("taxes ₪250,000 in 2026 at ₪41,812", () => {
    // 84,120 × 10% = 8,412
    // (120,720 − 84,120) × 14% = 36,600 × 14% = 5,124
    // (228,000 − 120,720) × 20% = 107,280 × 20% = 21,456
    // (250,000 − 228,000) × 31% = 22,000 × 31% = 6,820
    // total = 41,812
    expect(annualIncomeTax(250_000, yearConstants(2026))).toBeCloseTo(41_812, 2);
  });
});
