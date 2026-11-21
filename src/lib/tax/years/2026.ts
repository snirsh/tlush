import type { TaxYearSpec } from "../types";

export const TAX_YEAR_2026: TaxYearSpec = {
  year: 2026,
  incomeTax: {
    // Amendment 288 to §121, in force 1 Jan 2026, widens the 20% and 31% brackets.
    // Source: ITA monthly deductions booklet 2026
    // https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf
    // Source: Amendment 288 (Reshumot, Sefer HaChukim 3511, 31.3.2026)
    // https://fs.knesset.gov.il/25/law/25_lsr_12235101.pdf
    // Secondary: https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA_%D7%9E%D7%A1_%D7%94%D7%9B%D7%A0%D7%A1%D7%94
    brackets: [
      { upTo: 84_120, rate: 0.1 },
      { upTo: 120_720, rate: 0.14 },
      { upTo: 228_000, rate: 0.2 },
      { upTo: 301_200, rate: 0.31 },
      { upTo: 560_280, rate: 0.35 },
      // 47% on every additional shekel. The 3% above 721,560 is the separate
      // section 121B surtax below.
      { upTo: Infinity, rate: 0.47 },
    ],
  },
  nationalInsurance: {
    // Source: BTL employee rates
    // https://www.btl.gov.il/Insurance/Rates/Pages/%D7%9C%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D%20%D7%A9%D7%9B%D7%99%D7%A8%D7%99%D7%9D.aspx
    reducedThresholdMonthly: 7_703,
    reducedRate: 0.0427, // 1.04% NI + 3.23% health
    fullRate: 0.1217, // 7% NI + 5.17% health
    ceilingMonthly: 51_910,
  },
  surtax: {
    // Source: ITA monthly deductions booklet 2026 (link above)
    thresholdAnnual: 721_560,
    rate: 0.03,
    capitalExtraRate: 0.02, // extra 2% on capital / passive income above the threshold
  },
  capitalGains: {
    // Source: ITA annual report form 1399 instructions
    // https://www.gov.il/BlobFolder/service/reporting-and-payment-2025-annual-tax-report-for-individuals/he/Service_Pages_Income_tax_annual-report-2026_1399y-2025.pdf
    section102CapitalRate: 0.25,
  },
};
