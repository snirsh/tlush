import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { btlForYear, parseBtl } from "../btl";
import { classifyBooklet, isNextYearProbe, parseBooklet, stripBidi } from "../ita";

const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), "utf8");

// Published figures, written by hand from each booklet's chapter B table and chapter C.
const BRACKETS_2025 = [
  { upTo: 84_120, rateBp: 1000 },
  { upTo: 120_720, rateBp: 1400 },
  { upTo: 193_800, rateBp: 2000 },
  { upTo: 269_280, rateBp: 3100 },
  { upTo: 560_280, rateBp: 3500 },
  { upTo: null, rateBp: 4700 },
];
const BRACKETS_2026 = [
  { upTo: 84_120, rateBp: 1000 },
  { upTo: 120_720, rateBp: 1400 },
  { upTo: 228_000, rateBp: 2000 },
  { upTo: 301_200, rateBp: 3100 },
  { upTo: 560_280, rateBp: 3500 },
  { upTo: null, rateBp: 4700 },
];

describe("ITA booklet parser", () => {
  it.each([
    [2025, BRACKETS_2025],
    [2026, BRACKETS_2026],
  ])("reads the %i annual brackets, surtax threshold and credit point", (year, brackets) => {
    const { fields, problems } = parseBooklet(fixture(`ita-${year}-booklet.txt`), year);
    expect(problems).toEqual([]);
    expect(fields).toEqual({ brackets, surtaxThresholdAnnual: 721_560, creditPointMonthly: 242 });
  });

  it("refuses a booklet whose heading names another year", () => {
    const { fields, problems } = parseBooklet(fixture("ita-2026-booklet.txt"), 2025);
    expect(fields).toEqual({});
    expect(problems).toMatchObject([{ source: "ita", year: 2025, kind: "mismatch" }]);
  });

  it("reads nothing from a booklet without a year heading", () => {
    const text = stripBidi(fixture("ita-2026-booklet.txt")).replace(/להלן שיעורי המס לשנת/g, "");
    const { fields, problems } = parseBooklet(text, 2026);
    expect(fields).toEqual({});
    expect(problems).toMatchObject([{ source: "ita", year: 2026, kind: "missing", message: expect.stringContaining("Year heading") }]);
  });

  it("reports a missing bracket table and never reads the next table's rows instead", () => {
    const { fields, problems } = parseBooklet(fixture("ita-2026-no-brackets.txt"), 2026);
    expect(fields.brackets).toBeUndefined();
    expect(fields).toEqual({ surtaxThresholdAnnual: 721_560, creditPointMonthly: 242 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ source: "ita", year: 2026, kind: "missing" });
    expect(problems[0].excerpt).toBeTruthy();
  });

  it.each([
    ["a misread annual digit", (t: string) => t.replace("20%    228,000", "20%    229,000")],
    ["swapped annual and monthly columns", (t: string) => t.replace(/^ 10%\s+84,120\s+עד-\s+10%\s+7,010\s+עד-$/m, " 10%     7,010   עד-     10%    84,120   עד-")],
  ])("refuses the bracket table on %s", (_case, corrupt) => {
    const original = stripBidi(fixture("ita-2026-booklet.txt"));
    const text = corrupt(original);
    expect(text).not.toBe(original);
    const { fields, problems } = parseBooklet(text, 2026);
    expect(fields.brackets).toBeUndefined();
    expect(problems).toMatchObject([{ kind: "mismatch", message: expect.stringContaining("12 × the monthly bound") }]);
  });

  it("reports two different surtax thresholds as ambiguous", () => {
    const text = `${fixture("ita-2026-booklet.txt")}\nיחיד אשר הכנסתו החייבת בשנת המס עלתה על ₪ 698,280\n`;
    const { fields, problems } = parseBooklet(text, 2026);
    expect(fields.surtaxThresholdAnnual).toBeUndefined();
    expect(problems).toMatchObject([{ kind: "ambiguous", message: expect.stringContaining("698280") }]);
  });
});

describe("booklet response classification", () => {
  it("treats 404 as not published", () => {
    expect(classifyBooklet(2027, { status: 404, contentType: "text/html", bodyText: fixture("ita-404.html") })).toBe("absent");
  });

  it("treats a next-year probe's gov.il soft 404 as not published", () => {
    expect(classifyBooklet(2027, {
      status: 200,
      contentType: "text/html; charset=utf-8",
      bodyText: fixture("govil-not-found-200.html"),
    }, true)).toBe("absent");
  });

  it("recognizes a next-year PDF served with an HTML content type", () => {
    expect(classifyBooklet(2027, {
      status: 200,
      contentType: "text/html; charset=utf-8",
      bodyText: "\uFEFF \n%PDF-1.7",
    }, true)).toBe("pdf");
  });

  it("reports an HTML page served with 200 for the current year as a content-type problem", () => {
    const res = classifyBooklet(2026, { status: 200, contentType: "text/html; charset=utf-8", bodyText: fixture("govil-not-found-200.html") });
    expect(res).toMatchObject({ source: "ita", year: 2026, kind: "content-type", status: 200 });
    expect(typeof res === "object" && res.excerpt).toBeTruthy();
  });

  it("keeps HTML content-type errors strict for years with a spec", () => {
    const res = classifyBooklet(2025, { status: 200, contentType: "text/html; charset=utf-8", bodyText: fixture("govil-not-found-200.html") });
    expect(res).toMatchObject({ source: "ita", year: 2025, kind: "content-type", status: 200 });
  });

  it("reports other statuses as HTTP problems", () => {
    expect(classifyBooklet(2026, { status: 503, contentType: "text/html", bodyText: "" })).toMatchObject({ kind: "http", status: 503 });
    expect(classifyBooklet(2027, { status: 403, contentType: "text/html", bodyText: "" }, true)).toMatchObject({ kind: "http", status: 403 });
  });

  it("accepts a 200 PDF", () => {
    expect(classifyBooklet(2026, { status: 200, contentType: "application/pdf", bodyText: "" })).toBe("pdf");
    expect(classifyBooklet(2027, { status: 200, contentType: "application/pdf", bodyText: "" }, true)).toBe("pdf");
  });
});

describe("next-year probe selection", () => {
  it("probes only the next year when no spec exists", () => {
    expect(isNextYearProbe(2027, 2026, false)).toBe(true);
    expect(isNextYearProbe(2027, 2026, true)).toBe(false);
    expect(isNextYearProbe(2026, 2026, false)).toBe(false);
  });
});

describe("BTL employee-rates parser", () => {
  it("reads thresholds, employee rates and their effective dates", () => {
    const { page, problems } = parseBtl(fixture("btl-employee-rates.html"));
    expect(problems).toEqual([]);
    expect(page).toEqual({
      blReducedThresholdMonthly: { value: 7_703, effective: "01.01.2026" },
      blCeilingMonthly: { value: 51_910, effective: "01.01.2026" },
      blReducedRateBp: { value: 427, effective: "01.01.2025", niBp: 104, healthBp: 323 },
      blFullRateBp: { value: 1217, effective: "01.02.2025", niBp: 700, healthBp: 517 },
    });
  });

  it("refuses the rates when NI + health disagrees with the total row", () => {
    const { page, problems } = parseBtl(fixture("btl-sum-mismatch.html"));
    expect(page.blReducedRateBp).toBeUndefined();
    expect(page.blFullRateBp).toBeUndefined();
    expect(page.blReducedThresholdMonthly).toEqual({ value: 7_703, effective: "01.01.2026" });
    expect(problems).toMatchObject([{ source: "btl", kind: "mismatch", message: expect.stringContaining("4.37%") }]);
  });

  it("reports a page without the rate table", () => {
    const { page, problems } = parseBtl("<html><body><p>תחזוקה</p></body></html>");
    expect(page).toEqual({});
    expect(problems.map((p) => p.kind)).toEqual(["missing", "missing", "missing"]);
  });
});

describe("which BTL values describe a tax year", () => {
  const { page } = parseBtl(fixture("btl-employee-rates.html"));

  it("applies everything to the year the thresholds took effect", () => {
    expect(btlForYear(page, 2026)).toEqual({
      fields: { blReducedThresholdMonthly: 7_703, blCeilingMonthly: 51_910, blReducedRateBp: 427, blFullRateBp: 1217 },
      skipped: [],
    });
  });

  it("applies only the rates to the previous year", () => {
    const { fields, skipped } = btlForYear(page, 2025);
    expect(fields).toEqual({ blReducedRateBp: 427, blFullRateBp: 1217 });
    expect(skipped).toHaveLength(2);
  });

  it("applies only the rates to next year until BTL indexes the thresholds", () => {
    expect(btlForYear(page, 2027).fields).toEqual({ blReducedRateBp: 427, blFullRateBp: 1217 });
  });
});
