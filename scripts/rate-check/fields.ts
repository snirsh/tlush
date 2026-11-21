import type { TaxYearSpec } from "../../src/lib/tax/types";

/** Integer basis points: 4.27% is 427. Keeps rate comparison free of float noise. */
export type Bp = number;

/** One §121 bracket as published. `upTo: null` is the open-ended top bracket. */
export interface Bracket {
  upTo: number | null;
  rateBp: Bp;
}

/** Every figure the checker reads from an official page. */
export interface Fields {
  brackets: readonly Bracket[];
  surtaxThresholdAnnual: number;
  creditPointMonthly: number;
  blReducedThresholdMonthly: number;
  blCeilingMonthly: number;
  blReducedRateBp: Bp;
  blFullRateBp: Bp;
}

export type FieldKey = keyof Fields;
export type SourceId = "ita" | "btl";

interface FieldDef<K extends FieldKey> {
  label: string;
  source: SourceId;
  fromSpec: (spec: TaxYearSpec) => Fields[K];
  format: (value: Fields[K]) => string;
}

export const toBp = (fraction: number): Bp => Math.round(fraction * 10_000);
export const bpToFraction = (bp: Bp): number => bp / 10_000;
export const formatBp = (bp: Bp): string => `${bp / 100}%`;
export const formatIls = (n: number): string => n.toLocaleString("en-US");

const formatBrackets = (bs: readonly Bracket[]): string =>
  bs.map((b) => `${formatBp(b.rateBp)} ${b.upTo === null ? "above" : `to ${formatIls(b.upTo)}`}`).join(", ");

export const FIELDS: { [K in FieldKey]: FieldDef<K> } = {
  brackets: {
    label: "Income tax brackets (annual)",
    source: "ita",
    fromSpec: (s) =>
      s.incomeTax.brackets.map((b) => ({ upTo: b.upTo === Infinity ? null : b.upTo, rateBp: toBp(b.rate) })),
    format: formatBrackets,
  },
  surtaxThresholdAnnual: {
    label: "Surtax §121B threshold (annual)",
    source: "ita",
    fromSpec: (s) => s.surtax.thresholdAnnual,
    format: formatIls,
  },
  creditPointMonthly: {
    label: "Credit point (monthly)",
    source: "ita",
    fromSpec: (s) => s.creditPoint.monthlyValue,
    format: formatIls,
  },
  blReducedThresholdMonthly: {
    label: "BL reduced-rate threshold (monthly)",
    source: "btl",
    fromSpec: (s) => s.nationalInsurance.reducedThresholdMonthly,
    format: formatIls,
  },
  blCeilingMonthly: {
    label: "BL ceiling (monthly)",
    source: "btl",
    fromSpec: (s) => s.nationalInsurance.ceilingMonthly,
    format: formatIls,
  },
  blReducedRateBp: {
    label: "BL employee reduced rate",
    source: "btl",
    fromSpec: (s) => toBp(s.nationalInsurance.reducedRate),
    format: formatBp,
  },
  blFullRateBp: {
    label: "BL employee full rate",
    source: "btl",
    fromSpec: (s) => toBp(s.nationalInsurance.fullRate),
    format: formatBp,
  },
};

export const FIELD_KEYS = Object.keys(FIELDS) as FieldKey[];

export function sameValue<K extends FieldKey>(a: Fields[K], b: Fields[K]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function formatField<K extends FieldKey>(key: K, value: Fields[K]): string {
  return FIELDS[key].format(value);
}

/** A value read from an official page, with the date it took effect when the page states one. */
export interface Observed<T> {
  value: T;
  effective?: string;
}

/** Why a source could not yield a value. Never carries a guessed value. */
export interface Problem {
  source: SourceId;
  url: string;
  year?: number;
  kind: "http" | "content-type" | "network" | "missing" | "ambiguous" | "mismatch" | "pending";
  message: string;
  status?: number;
  excerpt?: string;
}

/**
 * Bidi controls and zero-width characters that pdftotext and the BTL page emit.
 * Built from code points so the source stays ASCII.
 */
export const invisibleChars = (): RegExp =>
  new RegExp("[\\u061C\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]", "g");

export function excerpt(text: string, at = 0, length = 300): string {
  return text.slice(Math.max(0, at), Math.max(0, at) + length).replace(/\s+/g, " ").trim();
}

/** `"84,120"` or `"7,703"` to a number. */
export const parseIls = (s: string): number => Number(s.replace(/,/g, ""));

/** `"4.27"` (percent) to basis points, exactly. */
export function percentToBp(s: string): Bp {
  const [int, frac = ""] = s.split(".");
  if (frac.length > 2) throw new Error(`more than 2 decimals in ${s}%`);
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}
