import { describe, expect, it } from "vitest";
import { combineRsuGrants, computeRsuGrant } from "../rsu";
import type { TaxProfile } from "../types";

// Synthetic 2026 RSU sales with every arithmetic step written out. All use fx
// 3.70, zero fees, capital track, a USD listing, and asOf 2026-06-01 (so every
// grant has passed the 2-year mark). Rates: brackets 10/14/20/31/35/47% with
// tops 84,120 / 120,720 / 228,000 / 301,200 / 560,280; Bituah Leumi 4.27% up to
// 7,703/month and 12.17% up to the 51,910/month ceiling; capital 25%; trustee
// withholding 47% + 3% = 50% on the income portion.

const ZERO_FEES = { foreignFee: 0, serviceFee: 0, wireFee: 0, conversionFee: 0 };
const AS_OF = new Date("2026-06-01");

interface Sale {
  salary: number;
  shares: number;
  grantDate: string;
  grantUsd: number;
  saleUsd: number;
}

function sell(sale: Sale) {
  const profile: TaxProfile = {
    monthlySalary: sale.salary,
    year: 2026,
    extraCapitalGain: 0,
    noIncomeYear: false,
  };
  const grant = computeRsuGrant(
    {
      shares: sale.shares,
      stockPrice: sale.saleUsd,
      grantPrice: sale.grantUsd,
      grantDate: new Date(sale.grantDate),
      fxRate: 3.7,
      isTase: false,
      whatIf2Years: false,
      workplaceMonthlySalary: sale.salary,
      fees: ZERO_FEES,
    },
    profile,
    AS_OF,
  );
  return { grant, combined: combineRsuGrants([grant], profile) };
}

type Expected = Record<
  | "gross"
  | "incomePortion"
  | "capitalPortion"
  | "marginalTax"
  | "bituah"
  | "capitalTax"
  | "totalTax"
  | "totalNet"
  | "netToBank"
  | "netToSalary",
  number
>;

function expectFigures(sale: Sale, expected: Expected) {
  const { grant, combined } = sell(sale);
  expect(grant.qualified).toBe(true);
  for (const [key, value] of Object.entries(expected)) {
    expect(grant[key as keyof Expected], key).toBeCloseTo(value, 2);
  }
  expect(combined.surtax).toBe(0);
  expect(grant.netToBank + grant.netToSalary).toBeCloseTo(grant.totalNet, 6);
}

describe("hand-worked 2026 RSU cases", () => {
  it("A: ₪7,000/mo salary, crosses the 10%→14% bracket and the reduced→full BL band", () => {
    // 60 shares, grant $40 (2023-03-01), sale $70.
    // gross          = 60 × 70 × 3.70 = 15,540
    // income portion = 60 × 40 × 3.70 = 8,880
    // capital portion = 15,540 − 8,880 = 6,660
    // marginal tax, salary 84,000/yr, income stacks to 92,880:
    //   84,000 → 84,120:    120 × 10% =    12
    //   84,120 → 92,880:  8,760 × 14% = 1,226.40
    //   total                         = 1,238.40
    // Bituah Leumi, 8,880 / 12 = 740/month on top of 7,000:
    //   7,000 → 7,703: 703 × 4.27%  = 30.0181
    //   7,703 → 7,740:  37 × 12.17% =  4.5029
    //   per month 34.521 × 12       = 414.252
    // capital tax = 6,660 × 25% = 1,665
    // total tax   = 1,238.40 + 414.252 + 1,665 = 3,317.652
    // total net   = 15,540 − 3,317.652 = 12,222.348
    // withholding = 8,880 × 50% = 4,440
    // net to bank   = 15,540 − 414.252 − 1,665 − 4,440 = 9,020.748
    // net to salary = 4,440 − 1,238.40 = 3,201.60
    expectFigures(
      { salary: 7_000, shares: 60, grantDate: "2023-03-01", grantUsd: 40, saleUsd: 70 },
      {
        gross: 15_540,
        incomePortion: 8_880,
        capitalPortion: 6_660,
        marginalTax: 1_238.4,
        bituah: 414.252,
        capitalTax: 1_665,
        totalTax: 3_317.652,
        totalNet: 12_222.348,
        netToBank: 9_020.748,
        netToSalary: 3_201.6,
      },
    );
  });

  it("B: ₪50,000/mo salary, all in the 47% bracket, BL clipped at the ceiling", () => {
    // 100 shares, grant $80 (2024-01-15), sale $120.
    // gross           = 100 × 120 × 3.70 = 44,400
    // income portion  = 100 × 80 × 3.70  = 29,600
    // capital portion = 44,400 − 29,600  = 14,800
    // marginal tax, salary 600,000/yr is already above 560,280:
    //   29,600 × 47% = 13,912
    // Bituah Leumi, 29,600 / 12 = 2,466.67/month on top of 50,000:
    //   50,000 → 51,910: 1,910 × 12.17% = 232.447; above the ceiling: 0
    //   per month 232.447 × 12 = 2,789.364
    // capital tax = 14,800 × 25% = 3,700
    // surtax: 600,000 + 29,600 + 14,800 = 644,400 < 721,560 ⇒ 0
    // total tax   = 13,912 + 2,789.364 + 3,700 = 20,401.364
    // total net   = 44,400 − 20,401.364 = 23,998.636
    // withholding = 29,600 × 50% = 14,800
    // net to bank   = 44,400 − 2,789.364 − 3,700 − 14,800 = 23,110.636
    // net to salary = 14,800 − 13,912 = 888
    expectFigures(
      { salary: 50_000, shares: 100, grantDate: "2024-01-15", grantUsd: 80, saleUsd: 120 },
      {
        gross: 44_400,
        incomePortion: 29_600,
        capitalPortion: 14_800,
        marginalTax: 13_912,
        bituah: 2_789.364,
        capitalTax: 3_700,
        totalTax: 20_401.364,
        totalNet: 23_998.636,
        netToBank: 23_110.636,
        netToSalary: 888,
      },
    );
  });
});

// Cross-check cases. Pre-fix values were measured by running the engine at
// 547b0dc (before this PR) on these exact inputs:
//
//          marginalTax  bituah    totalTax   totalNet   netToBank  netToSalary
//   Case 1  15,540.00   5,328.00  26,418.00  40,182.00  33,522.00  6,660.00
//   Case 2   1,850.00   1,110.00   5,272.50  13,227.50  10,452.50  2,775.00
//   Case 3  32,346.40   8,200.80  59,047.20  88,952.80  84,299.20  4,653.60
//
// gross, incomePortion, capitalPortion and capitalTax are unchanged. The old
// figures used the frozen 2024 brackets for 2026 (Case 1 marginal all at 35%),
// 12% Bituah Leumi, and the 50% last bracket as the withholding rate.
describe("cross-check cases (2026, corrected)", () => {
  it("Case 1: ₪25,000/mo, 100 shares, grant $120 (2023-01-01), sale $180", () => {
    // gross = 100 × 180 × 3.70 = 66,600; income = 100 × 120 × 3.70 = 44,400;
    // capital = 22,200.
    // marginal, salary 300,000 stacks to 344,400:
    //   300,000 → 301,200:  1,200 × 31% =    372
    //   301,200 → 344,400: 43,200 × 35% = 15,120   ⇒ 15,492
    // Bituah: 3,700/month on 25,000, all full band ⇒ 44,400 × 12.17% = 5,403.48
    // capital tax = 22,200 × 25% = 5,550
    // total tax = 15,492 + 5,403.48 + 5,550 = 26,445.48; net = 40,154.52
    // withholding 22,200 ⇒ bank = 66,600 − 5,403.48 − 5,550 − 22,200 = 33,446.52
    // salary = 22,200 − 15,492 = 6,708
    expectFigures(
      { salary: 25_000, shares: 100, grantDate: "2023-01-01", grantUsd: 120, saleUsd: 180 },
      {
        gross: 66_600,
        incomePortion: 44_400,
        capitalPortion: 22_200,
        marginalTax: 15_492,
        bituah: 5_403.48,
        capitalTax: 5_550,
        totalTax: 26_445.48,
        totalNet: 40_154.52,
        netToBank: 33_446.52,
        netToSalary: 6_708,
      },
    );
  });

  it("Case 2: ₪15,000/mo, 50 shares, grant $50 (2022-06-01), sale $100", () => {
    // gross = 50 × 100 × 3.70 = 18,500; income = 50 × 50 × 3.70 = 9,250;
    // capital = 9,250.
    // marginal, salary 180,000 stacks to 189,250, all in the 20% bracket ⇒ 1,850
    // Bituah: 770.83/month on 15,000, all full band ⇒ 9,250 × 12.17% = 1,125.725
    // capital tax = 9,250 × 25% = 2,312.50
    // total tax = 1,850 + 1,125.725 + 2,312.50 = 5,288.225; net = 13,211.775
    // withholding 4,625 ⇒ bank = 18,500 − 1,125.725 − 2,312.50 − 4,625 = 10,436.775
    // salary = 4,625 − 1,850 = 2,775
    expectFigures(
      { salary: 15_000, shares: 50, grantDate: "2022-06-01", grantUsd: 50, saleUsd: 100 },
      {
        gross: 18_500,
        incomePortion: 9_250,
        capitalPortion: 9_250,
        marginalTax: 1_850,
        bituah: 1_125.725,
        capitalTax: 2_312.5,
        totalTax: 5_288.225,
        totalNet: 13_211.775,
        netToBank: 10_436.775,
        netToSalary: 2_775,
      },
    );
  });

  it("Case 3: ₪45,000/mo, 200 shares, grant $100 (2022-01-01), sale $200", () => {
    // gross = 200 × 200 × 3.70 = 148,000; income = 200 × 100 × 3.70 = 74,000;
    // capital = 74,000.
    // marginal, salary 540,000 stacks to 614,000:
    //   540,000 → 560,280: 20,280 × 35% =  7,098
    //   560,280 → 614,000: 53,720 × 47% = 25,248.40   ⇒ 32,346.40
    // Bituah: 6,166.67/month on 45,000 tops out at 51,166.67 < 51,910 ceiling
    //   ⇒ 74,000 × 12.17% = 9,005.80
    // capital tax = 74,000 × 25% = 18,500
    // surtax: 540,000 + 74,000 + 74,000 = 688,000 < 721,560 ⇒ 0
    // total tax = 32,346.40 + 9,005.80 + 18,500 = 59,852.20; net = 88,147.80
    // withholding 37,000 ⇒ bank = 148,000 − 9,005.80 − 18,500 − 37,000 = 83,494.20
    // salary = 37,000 − 32,346.40 = 4,653.60
    expectFigures(
      { salary: 45_000, shares: 200, grantDate: "2022-01-01", grantUsd: 100, saleUsd: 200 },
      {
        gross: 148_000,
        incomePortion: 74_000,
        capitalPortion: 74_000,
        marginalTax: 32_346.4,
        bituah: 9_005.8,
        capitalTax: 18_500,
        totalTax: 59_852.2,
        totalNet: 88_147.8,
        netToBank: 83_494.2,
        netToSalary: 4_653.6,
      },
    );
  });
});
