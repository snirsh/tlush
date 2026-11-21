import type { YearConstants } from "./types";

/** Total progressive income tax on a given annual taxable income (ILS). */
export function annualIncomeTax(annualIncome: number, yc: YearConstants): number {
  if (annualIncome <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const bracket of yc.incomeTax.brackets) {
    if (annualIncome <= lower) break;
    const taxableInBracket = Math.min(annualIncome, bracket.upTo) - lower;
    tax += taxableInBracket * bracket.rate;
    lower = bracket.upTo;
  }
  return tax;
}

/**
 * Incremental ("marginal") income tax on an extra slice of ordinary income that
 * stacks on top of the existing annual salary. This is the correct way to tax
 * RSU/ESPP income: it lands in the brackets above the salary, so it can span
 * several brackets.
 */
export function marginalIncomeTax(
  baseAnnualIncome: number,
  extraIncome: number,
  yc: YearConstants,
): number {
  if (extraIncome <= 0) return 0;
  return (
    annualIncomeTax(baseAnnualIncome + extraIncome, yc) -
    annualIncomeTax(baseAnnualIncome, yc)
  );
}

/**
 * The §121 bracket rate that applies at a given annual income level. Excludes
 * the §121B surtax, which `surtax()` applies separately.
 */
export function marginalRateAt(annualIncome: number, yc: YearConstants): number {
  for (const bracket of yc.incomeTax.brackets) {
    if (annualIncome <= bracket.upTo) return bracket.rate;
  }
  return topBracketRate(yc);
}

function topBracketRate(yc: YearConstants): number {
  return yc.incomeTax.brackets[yc.incomeTax.brackets.length - 1].rate;
}

/**
 * The rate a Section 102 trustee withholds on the income portion: the top §121
 * bracket plus the §121B surtax (47% + 3% = 50%). The excess over the real
 * marginal tax comes back via salary or the annual return.
 */
export function trusteeWithholdingRate(yc: YearConstants): number {
  return topBracketRate(yc) + yc.surtax.rate;
}
