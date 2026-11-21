import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TAX_YEAR_SPECS } from "../../../src/lib/tax/years";
import type { TaxYearSpec } from "../../../src/lib/tax/types";
import { parseBtl, type BtlResult } from "../btl";
import { buildReport, changesFor, hasChanges, yearsToCheck, type YearOutcome } from "../compare";
import { parseBooklet, type BookletResult } from "../ita";

const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), "utf8");
const spec = (year: number) => TAX_YEAR_SPECS.find((s) => s.year === year)!;
const booklet2026 = parseBooklet(fixture("ita-2026-booklet.txt"), 2026);
const btlNow = parseBtl(fixture("btl-employee-rates.html"));

/** The BTL page as it would read once indexed for `year`. */
const btlIndexedFor = (year: number): BtlResult => ({
  problems: [],
  page: {
    ...btlNow.page,
    blReducedThresholdMonthly: { value: 7_850, effective: `01.01.${year}` },
    blCeilingMonthly: { value: 52_900, effective: `01.01.${year}` },
  },
});

/** A next-year booklet with the 2026 figures, as if it had been published unchanged. */
const unchangedBooklet: BookletResult = { fields: booklet2026.fields, problems: [] };

const existing = (o: YearOutcome) => {
  if (o.kind !== "existing") throw new Error(`expected an existing-year outcome, got ${o.kind}`);
  return o;
};

describe("yearsToCheck", () => {
  it("checks last year's and this year's specs, and probes next year", () => {
    expect(yearsToCheck([2024, 2025, 2026], 2026)).toEqual([2025, 2026, 2027]);
  });

  it("probes this year when it has no spec yet", () => {
    expect(yearsToCheck([2024, 2025, 2026], 2027)).toEqual([2026, 2027, 2028]);
  });
});

describe("buildReport", () => {
  it("reports a full match for 2026 against the official fixtures", () => {
    const report = buildReport([{ year: 2026, spec: spec(2026), booklet: booklet2026 }], btlNow, TAX_YEAR_SPECS);
    expect(report.problems).toEqual([]);
    expect(existing(report.years[0]).checks.map((c) => c.status)).toEqual(Array(7).fill("match"));
    expect(hasChanges(report)).toBe(false);
  });

  it("reports exactly the one field that differs", () => {
    const stale: TaxYearSpec = { ...spec(2026), nationalInsurance: { ...spec(2026).nationalInsurance, ceilingMonthly: 50_695 } };
    const report = buildReport([{ year: 2026, spec: stale, booklet: booklet2026 }], btlNow, TAX_YEAR_SPECS);
    const diffs = existing(report.years[0]).checks.filter((c) => c.status === "diff");
    expect(diffs).toEqual([{ key: "blCeilingMonthly", status: "diff", current: 50_695, official: 51_910 }]);
    expect(changesFor(existing(report.years[0]))).toEqual({ blCeilingMonthly: 51_910 });
  });

  it("compares rates in basis points, so float representation does not matter", () => {
    const floaty: TaxYearSpec = { ...spec(2026), nationalInsurance: { ...spec(2026).nationalInsurance, fullRate: 0.07 + 0.0517 } };
    const report = buildReport([{ year: 2026, spec: floaty, booklet: booklet2026 }], btlNow, TAX_YEAR_SPECS);
    expect(hasChanges(report)).toBe(false);
  });

  it("leaves last year's BL thresholds unchecked instead of comparing them with this year's", () => {
    const booklet2025 = parseBooklet(fixture("ita-2025-booklet.txt"), 2025);
    const report = buildReport([{ year: 2025, spec: spec(2025), booklet: booklet2025 }], btlNow, TAX_YEAR_SPECS);
    const unchecked = existing(report.years[0]).checks.filter((c) => c.status === "unchecked").map((c) => c.key);
    expect(unchecked).toEqual(["blReducedThresholdMonthly", "blCeilingMonthly"]);
    expect(hasChanges(report)).toBe(false);
  });

  it("builds a new year when ITA and BTL are both published for it", () => {
    const report = buildReport([{ year: 2027, booklet: unchangedBooklet }], btlIndexedFor(2027), TAX_YEAR_SPECS);
    expect(report.problems).toEqual([]);
    expect(report.years[0]).toMatchObject({
      year: 2027,
      kind: "new",
      carriedFrom: 2026,
      fields: { blReducedThresholdMonthly: 7_850, blCeilingMonthly: 52_900, creditPointMonthly: 242 },
    });
  });

  it("holds a new year back while BTL still shows last year's thresholds", () => {
    const report = buildReport([{ year: 2027, booklet: unchangedBooklet }], btlNow, TAX_YEAR_SPECS);
    expect(report.years[0]).toMatchObject({ year: 2027, kind: "new-pending" });
    expect(hasChanges(report)).toBe(false);
    expect(report.problems).toMatchObject([
      { kind: "pending", year: 2027, message: expect.stringMatching(/^2027: ITA published, BTL not yet updated/) },
    ]);
  });

  it("ignores an unpublished next year", () => {
    const report = buildReport([{ year: 2027, booklet: "absent" }], btlNow, TAX_YEAR_SPECS);
    expect(report).toEqual({ years: [{ year: 2027, kind: "not-published" }], problems: [] });
  });

  it("treats a 404 for a year that has a spec as a problem", () => {
    const report = buildReport([{ year: 2026, spec: spec(2026), booklet: "absent" }], btlNow, TAX_YEAR_SPECS);
    expect(report.problems).toMatchObject([{ source: "ita", year: 2026, kind: "http", status: 404 }]);
    const statuses = existing(report.years[0]).checks.map((c) => c.status);
    expect(statuses).toEqual(["unchecked", "unchecked", "unchecked", "match", "match", "match", "match"]);
  });

  it("keeps a failed source's fields unchecked and still compares the rest", () => {
    const noBrackets = parseBooklet(fixture("ita-2026-no-brackets.txt"), 2026);
    const mismatch = parseBtl(fixture("btl-sum-mismatch.html"));
    const report = buildReport([{ year: 2026, spec: spec(2026), booklet: noBrackets }], mismatch, TAX_YEAR_SPECS);
    const byKey = Object.fromEntries(existing(report.years[0]).checks.map((c) => [c.key, c.status]));
    expect(byKey).toEqual({
      brackets: "unchecked",
      surtaxThresholdAnnual: "match",
      creditPointMonthly: "match",
      blReducedThresholdMonthly: "match",
      blCeilingMonthly: "match",
      blReducedRateBp: "unchecked",
      blFullRateBp: "unchecked",
    });
    expect(report.problems.map((p) => `${p.source}:${p.kind}`)).toEqual(["btl:mismatch", "ita:missing"]);
  });
});
