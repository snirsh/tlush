import { describe, expect, it } from "vitest";
import { yearConstants } from "../constants";
import { annualIncomeTax, marginalRateAt } from "../income";
import { bituahOnMonthlySlice } from "../bituah";
import { combineRsuGrants, computeRsuGrant } from "../rsu";

describe("top bracket is 47%; the 3% above 721,560 is surtax only", () => {
  it.each([2024, 2025, 2026])("%i: last bracket is 47% open-ended above 560,280", (year) => {
    const brackets = yearConstants(year).incomeTax.brackets;
    expect(brackets.slice(-2)).toEqual([
      { upTo: 560_280, rate: 0.35 },
      { upTo: Infinity, rate: 0.47 },
    ]);
    expect(marginalRateAt(1_000_000, yearConstants(year))).toBe(0.47);
  });

  it("2026 ₪70,000/mo + ₪100,000 RSU income: 47% income tax + 3% surtax, 50% withheld", () => {
    const profile = { monthlySalary: 70_000, year: 2026, extraCapitalGain: 0, noIncomeYear: false };
    const grant = computeRsuGrant(
      {
        shares: 1,
        stockPrice: 100_000,
        grantPrice: 100_000,
        grantDate: new Date("2020-01-01"),
        fxRate: 1,
        isTase: true,
        whatIf2Years: false,
        workplaceMonthlySalary: 70_000,
        fees: { foreignFee: 0, serviceFee: 0, wireFee: 0, conversionFee: 0 },
      },
      profile,
      new Date("2026-06-01"),
    );
    const combined = combineRsuGrants([grant], profile);
    // Salary 840,000 is already above 560,280, so the slice is all at 47%.
    expect(grant.marginalTax).toBeCloseTo(47_000, 2);
    // Salary is above the 51,910 ceiling, so no Bituah Leumi.
    expect(grant.bituah).toBe(0);
    // Surtax: (840,000 + 100,000 − 721,560) × 3% = 218,440 × 3% = 6,553.20.
    expect(combined.surtax).toBeCloseTo(6_553.2, 2);
    // Trustee withholds 47% + 3% = 50%: bank gets 50,000, salary gets 50,000 − 47,000.
    expect(grant.netToBank).toBeCloseTo(50_000, 2);
    expect(grant.netToSalary).toBeCloseTo(3_000, 2);
    expect(combined.totalNet).toBeCloseTo(100_000 - 47_000 - 6_553.2, 2);
  });
});

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

describe("Bituah Leumi reduced threshold and ceiling", () => {
  it.each([
    [2024, 7_522, 49_030],
    [2025, 7_522, 50_695],
    [2026, 7_703, 51_910],
  ])("%i: reduced band up to ₪%i/month, ceiling ₪%i/month", (year, threshold, ceiling) => {
    const ni = yearConstants(year).nationalInsurance;
    expect(ni.reducedThresholdMonthly).toBe(threshold);
    expect(ni.ceilingMonthly).toBe(ceiling);
  });

  it("splits a 2026 slice across the ₪7,703 threshold", () => {
    // 7,600 → 7,703 reduced: 103 × 4.27% = 4.3981
    // 7,703 → 7,800 full:     97 × 12.17% = 11.8049
    expect(bituahOnMonthlySlice(7_600, 200, yearConstants(2026))).toBeCloseTo(16.203, 4);
  });

  it("stops a 2026 slice at the ₪51,910 ceiling", () => {
    // 51,000 → 51,910 full: 910 × 12.17% = 110.747; nothing above the ceiling.
    expect(bituahOnMonthlySlice(51_000, 2_000, yearConstants(2026))).toBeCloseTo(110.747, 4);
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
