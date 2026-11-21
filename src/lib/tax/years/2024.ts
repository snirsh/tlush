import type { TaxYearSpec } from "../types";

export const TAX_YEAR_2024: TaxYearSpec = {
  year: 2024,
  incomeTax: {
    // Source: ITA monthly deductions booklet 2024
    // https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2024.pdf
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
    // Source: BTL employer circular 1511 (rates for 2024)
    // https://www.btl.gov.il/Insurance/HozrimBituah/Hozrim/%D7%A9%D7%99%D7%A0%D7%95%D7%99%20%D7%91%D7%AA%D7%A9%D7%9C%D7%95%D7%9D%20%D7%93%D7%9E%D7%99%20%D7%91%D7%99%D7%98%D7%95%D7%97%20%D7%9C%D7%90%D7%95%D7%9E%D7%99%20%D7%95%D7%93%D7%9E%D7%99%20%D7%91%D7%99%D7%98%D7%95%D7%97%20%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA%20%D7%9C%D7%A9%D7%A0%D7%AA%202024.pdf
    reducedThresholdMonthly: 7_522,
    reducedRate: 0.035, // 0.4% NI + 3.1% health
    fullRate: 0.12, // 7% NI + 5% health
    ceilingMonthly: 49_030,
  },
  surtax: {
    // Source: ITA monthly deductions booklet 2024 (link above)
    thresholdAnnual: 721_560,
    rate: 0.03,
    capitalExtraRate: 0,
  },
  capitalGains: {
    // Source: ITA annual report form 1399 instructions
    // https://www.gov.il/BlobFolder/service/reporting-and-payment-2025-annual-tax-report-for-individuals/he/Service_Pages_Income_tax_annual-report-2026_1399y-2025.pdf
    section102CapitalRate: 0.25,
  },
  creditPoint: {
    // Source: ITA monthly deductions booklet 2024, section "סכומים מתואמים"
    // https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2024.pdf
    monthlyValue: 242,
  },
};
