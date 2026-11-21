import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TAX_YEAR_SPECS } from "../../../src/lib/tax/years";
import type { TaxYearSpec } from "../../../src/lib/tax/types";
import { parseBtl } from "../btl";
import { FIELD_KEYS, FIELDS, type Fields } from "../fields";
import { parseBooklet } from "../ita";
import { lineDiff } from "../render";
import { addYearToIndex, renderNewYearFile, rewriteSpecFile } from "../specFile";

const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), "utf8");
const src2026 = repoFile("src/lib/tax/years/2026.ts");
const spec2026 = TAX_YEAR_SPECS.find((s) => s.year === 2026)!;
const btl = parseBtl(fixture("btl-employee-rates.html")).page;

/** Evaluates a generated year file the way the app would import it. */
async function load(text: string, name: string): Promise<TaxYearSpec> {
  const dir = mkdtempSync(join(tmpdir(), "rate-check-"));
  const path = join(dir, "spec.ts");
  writeFileSync(path, text);
  return (await import(/* @vite-ignore */ path))[name];
}

const changedLines = (before: string, after: string) => lineDiff("f", before, after).split("\n").slice(2);

describe("rewriteSpecFile", () => {
  it("replaces one literal and leaves every other line, comments included, alone", () => {
    const { text, notes } = rewriteSpecFile(src2026, { blCeilingMonthly: 52_900 });
    expect(notes).toEqual([]);
    expect(changedLines(src2026, text)).toEqual(["-  29     ceilingMonthly: 51_910,", "+  29     ceilingMonthly: 52_900,"]);
  });

  it("rewrites a changed bracket in place", async () => {
    const brackets = FIELDS.brackets.fromSpec(spec2026).map((b) => (b.upTo === 228_000 ? { ...b, upTo: 231_000 } : b));
    const { text } = rewriteSpecFile(src2026, { brackets });
    expect(changedLines(src2026, text)).toHaveLength(2);
    expect((await load(text, "TAX_YEAR_2026")).incomeTax.brackets[2]).toEqual({ upTo: 231_000, rate: 0.2 });
  });

  it("updates a rate and its NI + health breakdown comment together", () => {
    const page = { ...btl, blFullRateBp: { value: 1227, effective: "01.01.2027", niBp: 710, healthBp: 517 } };
    const { text } = rewriteSpecFile(src2026, { blFullRateBp: 1227 }, page);
    expect(changedLines(src2026, text)).toEqual([
      "-  28     fullRate: 0.1217, // 7% NI + 5.17% health",
      "+  28     fullRate: 0.1227, // 7.1% NI + 5.17% health",
    ]);
  });

  it("updates the surtax threshold and the comment that quotes it", () => {
    const { text } = rewriteSpecFile(src2026, { surtaxThresholdAnnual: 735_000 });
    expect(text).toContain("thresholdAnnual: 735_000,");
    expect(text).toContain("The 3% above 735,000 is the separate");
    expect(text).not.toContain("721");
  });

  it("produces a file whose spec reads back as the official values", async () => {
    const changes: Partial<Fields> = {
      brackets: FIELDS.brackets.fromSpec(spec2026).map((b) => ({ ...b, upTo: b.upTo && b.upTo + 1000 })),
      surtaxThresholdAnnual: 735_000,
      creditPointMonthly: 250,
      blReducedThresholdMonthly: 7_850,
      blCeilingMonthly: 52_900,
      blReducedRateBp: 437,
    };
    const loaded = await load(rewriteSpecFile(src2026, changes).text, "TAX_YEAR_2026");
    for (const key of FIELD_KEYS) {
      const expected = changes[key] ?? FIELDS[key].fromSpec(spec2026);
      expect(FIELDS[key].fromSpec(loaded), key).toEqual(expected);
    }
  });
});

describe("renderNewYearFile", () => {
  const fields: Fields = {
    ...(parseBooklet(fixture("ita-2026-booklet.txt"), 2026).fields as Required<ReturnType<typeof parseBooklet>["fields"]>),
    blReducedThresholdMonthly: 7_850,
    blCeilingMonthly: 52_900,
    blReducedRateBp: 427,
    blFullRateBp: 1217,
  };
  const page = {
    ...btl,
    blReducedThresholdMonthly: { value: 7_850, effective: "01.01.2027" },
    blCeilingMonthly: { value: 52_900, effective: "01.01.2027" },
  };
  const text = renderNewYearFile(2027, fields, spec2026, page);

  it("is a valid spec carrying the official values and the previous year's unchecked ones", async () => {
    const loaded = await load(text, "TAX_YEAR_2027");
    expect(loaded.year).toBe(2027);
    for (const key of FIELD_KEYS) expect(FIELDS[key].fromSpec(loaded), key).toEqual(fields[key]);
    expect(loaded.surtax.rate).toBe(spec2026.surtax.rate);
    expect(loaded.surtax.capitalExtraRate).toBe(spec2026.surtax.capitalExtraRate);
    expect(loaded.capitalGains).toEqual(spec2026.capitalGains);
  });

  it("cites the year's own booklet and the BTL effective dates, and marks carried values", () => {
    expect(text).toContain("monthly-deductions-booklet-2027.pdf");
    expect(text).not.toContain("booklet-2026");
    expect(text).toContain("threshold from 01.01.2027, ceiling from 01.01.2027");
    expect(text.match(/Carried over from 2026/g)).toHaveLength(2);
    expect(text).toContain("reducedRate: 0.0427, // 1.04% NI + 3.23% health");
  });

  it("does not copy the previous year's one-off comments", () => {
    expect(text).not.toContain("Amendment 288");
  });
});

describe("addYearToIndex", () => {
  const index = repoFile("src/lib/tax/years/index.ts");

  it("adds one import and one entry", () => {
    const next = addYearToIndex(index, 2027);
    expect(changedLines(index, next)).toEqual([
      '+   5 import { TAX_YEAR_2027 } from "./2027";',
      "+  12   TAX_YEAR_2027,",
    ]);
  });

  it("is a no-op when the year is already registered", () => {
    const once = addYearToIndex(index, 2027);
    expect(addYearToIndex(once, 2027)).toBe(once);
  });
});
