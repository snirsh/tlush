import type { TaxYearSpec } from "../../src/lib/tax/types";
import { btlForYear, BTL_URL, type BtlResult } from "./btl";
import { FIELD_KEYS, FIELDS, sameValue, type FieldKey, type Fields, type Problem } from "./fields";
import { bookletUrl, type BookletResult } from "./ita";

export interface YearInput {
  year: number;
  spec?: TaxYearSpec;
  /** `"absent"` when the booklet URL returned 404. */
  booklet: BookletResult | "absent" | "skipped";
}

export type FieldCheck = {
  [K in FieldKey]: { key: K; status: "match" | "diff" | "unchecked"; current: Fields[K]; official?: Fields[K]; note?: string };
}[FieldKey];

export type YearOutcome =
  | { year: number; kind: "existing"; checks: FieldCheck[] }
  | { year: number; kind: "new"; fields: Fields; carriedFrom: number }
  | { year: number; kind: "new-pending"; reason: string }
  | { year: number; kind: "not-published" };

export interface Report {
  years: YearOutcome[];
  problems: Problem[];
}

/**
 * Spec years from last calendar year on, plus this year and next year. A year
 * without a spec is reported only if its booklet is published.
 */
export function yearsToCheck(specYears: number[], calendarYear: number): number[] {
  const years = new Set(specYears.filter((y) => y >= calendarYear - 1));
  for (const y of [calendarYear, calendarYear + 1]) years.add(y);
  return [...years].sort((a, b) => a - b);
}

export function buildReport(inputs: YearInput[], btl: BtlResult | "skipped", specs: readonly TaxYearSpec[]): Report {
  const problems: Problem[] = btl === "skipped" ? [] : [...btl.problems];
  const checked = inputs.filter((i) => i.spec || i.booklet !== "skipped");
  const years = checked.map((input): YearOutcome => {
    const btlYear = btl === "skipped" ? undefined : btlForYear(btl.page, input.year);
    if (input.booklet !== "absent" && input.booklet !== "skipped") problems.push(...input.booklet.problems);
    const ita = typeof input.booklet === "object" ? input.booklet.fields : {};
    const official: Partial<Fields> = { ...ita, ...btlYear?.fields };

    if (input.spec) {
      if (input.booklet === "absent") {
        problems.push({
          source: "ita",
          url: bookletUrl(input.year),
          year: input.year,
          kind: "http",
          status: 404,
          message: `Booklet for ${input.year} returned 404, but ${input.year} has a spec file`,
        });
      }
      const spec = input.spec;
      const checks = FIELD_KEYS.map((key) => check(key, spec, official, uncheckedNote(key, input, btl, btlYear?.skipped)));
      return { year: input.year, kind: "existing", checks };
    }

    if (input.booklet === "absent" || input.booklet === "skipped") return { year: input.year, kind: "not-published" };
    const missing = FIELD_KEYS.filter((k) => official[k] === undefined);
    if (missing.length === 0) {
      const previous = [...specs].filter((s) => s.year < input.year).sort((a, b) => b.year - a.year)[0];
      return { year: input.year, kind: "new", fields: official as Fields, carriedFrom: previous.year };
    }
    const btlMissing = missing.every((k) => FIELDS[k].source === "btl");
    const reason = btlMissing
      ? `${input.year}: ITA published, BTL not yet updated (${missing.join(", ")})`
      : `${input.year}: ITA booklet published, but these fields could not be read: ${missing.join(", ")}`;
    problems.push({
      source: btlMissing ? "btl" : "ita",
      url: btlMissing ? BTL_URL : bookletUrl(input.year),
      year: input.year,
      kind: "pending",
      message: reason,
    });
    return { year: input.year, kind: "new-pending", reason };
  });
  return { years, problems };
}

function check<K extends FieldKey>(key: K, spec: TaxYearSpec, official: Partial<Fields>, note: string): FieldCheck {
  const current = FIELDS[key].fromSpec(spec);
  const value = official[key];
  if (value === undefined) return { key, status: "unchecked", current, note } as FieldCheck;
  return { key, status: sameValue<K>(current, value) ? "match" : "diff", current, official: value } as FieldCheck;
}

function uncheckedNote(key: FieldKey, input: YearInput, btl: BtlResult | "skipped", skipped: string[] = []): string {
  if (FIELDS[key].source === "btl") {
    if (btl === "skipped") return "BTL source not checked in this run";
    return skipped.find((s) => s.startsWith(`${key}:`))?.slice(key.length + 2) ?? "could not be read from the BTL page";
  }
  if (input.booklet === "skipped") return "ITA source not checked in this run";
  return input.booklet === "absent" ? "booklet not found" : "could not be read from the booklet";
}

/** Field values that differ from the spec, per existing year. */
export function changesFor(outcome: Extract<YearOutcome, { kind: "existing" }>): Partial<Fields> {
  const out: Partial<Fields> = {};
  for (const c of outcome.checks) if (c.status === "diff") Object.assign(out, { [c.key]: c.official });
  return out;
}

export const hasChanges = (r: Report): boolean =>
  r.years.some((y) => y.kind === "new" || (y.kind === "existing" && y.checks.some((c) => c.status === "diff")));
