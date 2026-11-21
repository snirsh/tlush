import type { TaxYearSpec } from "../types";

export const TAX_YEAR_2026: TaxYearSpec = {
  year: 2026,
  incomeTax: {
    // Source: ITA monthly deductions booklet 2026
    // https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf
    brackets: [
      { upTo: 84_120, rate: 0.1 },
      { upTo: 120_720, rate: 0.14 },
      { upTo: 193_800, rate: 0.2 },
      { upTo: 269_280, rate: 0.31 },
      { upTo: 560_280, rate: 0.35 },
      { upTo: 721_560, rate: 0.47 },
      { upTo: Infinity, rate: 0.5 },
    ],
  },
  nationalInsurance: {
    // Source: BTL employee rates
    // https://www.btl.gov.il/Insurance/Rates/Pages/%D7%9C%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D%20%D7%A9%D7%9B%D7%99%D7%A8%D7%99%D7%9D.aspx
    reducedThresholdMonthly: 7_522,
    reducedRate: 0.035,
    fullRate: 0.12,
    ceilingMonthly: 50_695,
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
