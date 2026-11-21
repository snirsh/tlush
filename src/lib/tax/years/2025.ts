import type { TaxYearSpec } from "../types";

export const TAX_YEAR_2025: TaxYearSpec = {
  year: 2025,
  incomeTax: {
    // Brackets frozen at the 2024 values (no indexation).
    // Source: ITA monthly deductions booklet 2025
    // https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2025.pdf
    brackets: [
      { upTo: 84_120, rate: 0.1 },
      { upTo: 120_720, rate: 0.14 },
      { upTo: 193_800, rate: 0.2 },
      { upTo: 269_280, rate: 0.31 },
      { upTo: 560_280, rate: 0.35 },
      // 47% on every additional shekel. The 3% above 721,560 is the separate
      // section 121B surtax below.
      { upTo: Infinity, rate: 0.47 },
    ],
  },
  nationalInsurance: {
    // Source: BTL employer circular 1515 (rates from February 2025)
    // https://www.btl.gov.il/Insurance/HozrimBituah/Hozrim/%D7%A9%D7%99%D7%A0%D7%95%D7%99%20%D7%91%D7%AA%D7%A9%D7%9C%D7%95%D7%9D%20%D7%93%D7%9E%D7%99%20%D7%91%D7%99%D7%98%D7%95%D7%97%20%D7%9C%D7%90%D7%95%D7%9E%D7%99%20%D7%95%D7%93%D7%9E%D7%99%20%D7%91%D7%99%D7%98%D7%95%D7%97%20%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA%20%D7%9C%D7%A9%D7%A0%D7%AA%202025%20%D7%94%D7%97%D7%9C%20%D7%9E%D7%97%D7%95%D7%93%D7%A9%20%D7%A4%D7%91%D7%A8%D7%95%D7%90%D7%A8%202025.pdf
    //
    // Mid-year change. In January 2025 the full health rate was 5.16% (total
    // 12.16%). From 1 February 2025 it is 5.17% (total 12.17%). The reduced
    // health rate of 3.23% applies from 1 January. tlush annualises, so 2025
    // uses the February to December rate. The overstatement is at most 0.01% of
    // one month's income, under ₪1 per ₪100,000 of annual income.
    reducedThresholdMonthly: 7_522,
    reducedRate: 0.0427, // 1.04% NI + 3.23% health
    fullRate: 0.1217, // 7% NI + 5.17% health
    ceilingMonthly: 50_695,
  },
  surtax: {
    // Source: ITA monthly deductions booklet 2025 (link above)
    thresholdAnnual: 721_560,
    rate: 0.03,
    capitalExtraRate: 0.02, // extra 2% on capital / passive income above the threshold, from 2025
  },
  capitalGains: {
    // Source: ITA annual report form 1399 instructions
    // https://www.gov.il/BlobFolder/service/reporting-and-payment-2025-annual-tax-report-for-individuals/he/Service_Pages_Income_tax_annual-report-2026_1399y-2025.pdf
    section102CapitalRate: 0.25,
  },
};
