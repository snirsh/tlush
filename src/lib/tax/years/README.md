# Tax year specs

Each file here exports one `TaxYearSpec` (see `../types.ts`) for one Israeli tax
year. The engine reads tax figures only from these specs.

## Adding a year

1. Copy the latest file to `<year>.ts` and update every value from the sources
   below.
2. Add one line to `TAX_YEAR_SPECS` in `index.ts`.
3. Add the year's expected figures to `../__tests__/yearSpecs.test.ts`. Write the
   published values by hand. Do not read them back from the spec.

The monthly rate checker (`scripts/rate-check/`) opens a PR with steps 1 and 2
done once both the ITA booklet and the BTL page publish the year. Step 3 stays
manual on purpose.

The UI year selector picks up the new year from `SUPPORTED_YEARS` on its own.
`yearConstants()` throws a `RangeError` for any year not registered here.

## Source policy

- Every value carries a comment citing its primary source: ITA, BTL, or the
  law as published in Reshumot. Kolzchut is a secondary cross-check only.
- Never copy figures from a third-party calculator's output.
- `creditPoint.monthlyValue` comes from the booklet section "סכומים מתואמים"
  ("נקודת זיכוי ... לחודש"). The engine does not read it yet.
- The top §121 bracket is 47% with no upper bound. The 3% above the surtax
  threshold is §121B surtax and lives only in `surtax`, never as a bracket.

## Mid-year changes

tlush annualises every rate. When a rate changes during the year, the spec
uses the rate in force for most of the year, and the year file documents the
change and its maximum effect. Per-month modelling is out of scope.

2025 is the current example. The full health rate was 5.16% in January (12.16%
total) and 5.17% from 1 February (12.17% total). The spec uses 12.17%, which
overstates by at most 0.01% of one month's income, under ₪1 per ₪100,000 of
annual income. The reduced health rate of 3.23% applies from 1 January.

## Sources

- ITA monthly deductions booklet 2026: https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf
- ITA monthly deductions booklet 2025: https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2025.pdf
- ITA monthly deductions booklet 2024: https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2024.pdf
- Amendment 288 to the Income Tax Ordinance (Reshumot, Sefer HaChukim 3511, 31.3.2026): https://fs.knesset.gov.il/25/law/25_lsr_12235101.pdf
- Kolzchut income tax brackets (secondary): https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA_%D7%9E%D7%A1_%D7%94%D7%9B%D7%A0%D7%A1%D7%94
- BTL employee rates (2026): https://www.btl.gov.il/Insurance/Rates/Pages/%D7%9C%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D%20%D7%A9%D7%9B%D7%99%D7%A8%D7%99%D7%9D.aspx
- BTL employer circular 1511 (2024): https://www.btl.gov.il/Insurance/HozrimBituah/Hozrim/%D7%A9%D7%99%D7%A0%D7%95%D7%99%20%D7%91%D7%AA%D7%A9%D7%9C%D7%95%D7%9D%20%D7%93%D7%9E%D7%99%20%D7%91%D7%99%D7%98%D7%95%D7%97%20%D7%9C%D7%90%D7%95%D7%9E%D7%99%20%D7%95%D7%93%D7%9E%D7%99%20%D7%91%D7%99%D7%98%D7%95%D7%97%20%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA%20%D7%9C%D7%A9%D7%A0%D7%AA%202024.pdf
- BTL employer circular 1515 (from February 2025): https://www.btl.gov.il/Insurance/HozrimBituah/Hozrim/%D7%A9%D7%99%D7%A0%D7%95%D7%99%20%D7%91%D7%AA%D7%A9%D7%9C%D7%95%D7%9D%20%D7%93%D7%9E%D7%99%20%D7%91%D7%99%D7%98%D7%95%D7%97%20%D7%9C%D7%90%D7%95%D7%9E%D7%99%20%D7%95%D7%93%D7%9E%D7%99%20%D7%91%D7%99%D7%98%D7%95%D7%97%20%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA%20%D7%9C%D7%A9%D7%A0%D7%AA%202025%20%D7%94%D7%97%D7%9C%20%D7%9E%D7%97%D7%95%D7%93%D7%A9%20%D7%A4%D7%91%D7%A8%D7%95%D7%90%D7%A8%202025.pdf
- Section 102 capital track 25% (ITA form 1399 instructions): https://www.gov.il/BlobFolder/service/reporting-and-payment-2025-annual-tax-report-for-individuals/he/Service_Pages_Income_tax_annual-report-2026_1399y-2025.pdf
