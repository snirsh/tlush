// Shared types for the Israeli RSU / ESPP tax engine.
//
// All monetary figures inside the engine are expressed in New Israeli Shekels
// (ILS) unless a field name explicitly ends with `Usd`. Currency conversion is
// done at the edges (input parsing) so the core math stays in a single unit.

/** Broker / trustee fee rates applied to a sale. */
export interface SaleFees {
  /** Foreign broker commission, as a fraction of trade value (e.g. 0.0007 = 0.07%). */
  foreignFee: number;
  /** Local service (IBI) fee, as a fraction of trade value. */
  serviceFee: number;
  /** Flat wire-transfer fee, charged once per sale, in the sale currency. */
  wireFee: number;
  /** USD→ILS conversion fee charged by the trustee, as a fraction (0–0.02). */
  conversionFee: number;
}

/** A person's tax situation for a given calendar year. */
export interface TaxProfile {
  /** Gross average monthly salary (ILS) used to position RSU/ESPP income in the
   *  marginal brackets and to compute Bituah Leumi headroom. */
  monthlySalary: number;
  /** Tax year whose brackets / rates apply. */
  year: number;
  /** Extra realised capital gain (+) or loss (−) elsewhere this year, affecting surtax. */
  extraCapitalGain: number;
  /** True if the person had no employment income at all this year. */
  noIncomeYear: boolean;
}

/** One §121 income-tax bracket: `rate` applies to annual income up to `upTo`. */
export interface IncomeTaxBracket {
  upTo: number;
  rate: number;
}

/**
 * Everything that defines one Israeli tax year, grouped by domain. One file per
 * year lives in `years/`, and the engine reads only from these specs.
 *
 * Rates are annualised. When a rate changes mid-year, the spec carries the rate
 * in force for most of the year and its file documents the change (see 2025).
 *
 * Reserved future siblings, not modelled yet: creditPoints, pension, hishtalmut.
 */
export interface TaxYearSpec {
  year: number;
  incomeTax: {
    /** Progressive §121 brackets (annual, ILS), ascending. The last is open-ended. */
    brackets: readonly IncomeTaxBracket[];
  };
  /** Bituah Leumi + health insurance (employee side). */
  nationalInsurance: {
    /** Monthly income threshold below which the reduced rate applies. */
    reducedThresholdMonthly: number;
    /** Combined NI + health reduced rate. */
    reducedRate: number;
    /** Combined NI + health full rate. */
    fullRate: number;
    /** Monthly income ceiling above which no contributions are due. */
    ceilingMonthly: number;
  };
  /** Surtax ("mas yesef", §121B). */
  surtax: {
    /** Annual income threshold above which surtax applies. */
    thresholdAnnual: number;
    /** Surtax rate on ordinary income above the threshold. */
    rate: number;
    /** Additional surtax rate on capital / passive income above the threshold. */
    capitalExtraRate: number;
  };
  capitalGains: {
    /** Capital-gains rate on the capital portion under the Section 102 capital track. */
    section102CapitalRate: number;
  };
}

export type YearConstants = TaxYearSpec;
