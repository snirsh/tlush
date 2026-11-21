import { excerpt, invisibleChars, parseIls, percentToBp, type Bp, type Fields, type Observed, type Problem } from "./fields";

export const BTL_URL =
  "https://www.btl.gov.il/Insurance/Rates/Pages/%D7%9C%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D%20%D7%A9%D7%9B%D7%99%D7%A8%D7%99%D7%9D.aspx";

export type BtlFields = Pick<
  Fields,
  "blReducedThresholdMonthly" | "blCeilingMonthly" | "blReducedRateBp" | "blFullRateBp"
>;

/** An employee rate and the NI and health parts it is the sum of. */
export interface EmployeeRate extends Observed<Bp> {
  niBp: Bp;
  healthBp: Bp;
}

export interface BtlPage {
  blReducedThresholdMonthly?: Observed<number>;
  blCeilingMonthly?: Observed<number>;
  blReducedRateBp?: EmployeeRate;
  blFullRateBp?: EmployeeRate;
}

export interface BtlResult {
  page: BtlPage;
  problems: Problem[];
}

const DATE = String.raw`\(החל ב-\s*(\d{2}\.\d{2}\.\d{4})\)`;
const THRESHOLD = new RegExp(String.raw`מדרגת גביה מופחתת\s*\(שיעור מופחת\)\s*-\s*(\d{1,3}(?:,\d{3})+)\s*ש"ח\s*${DATE}`, "g");
const CEILING = new RegExp(
  String.raw`ההכנסה המרבית החייבת בדמי ביטוח\s*\(שיעור מלא\)\s*-\s*(\d{1,3}(?:,\d{3})+)\s*ש"ח\s*${DATE}`,
  "g",
);
const TABLE_HEADER = "מעסיק עובד סך הכול מעסיק עובד סך הכול";
const NI_ROW = "דמי ביטוח לאומי";
const HEALTH_ROW = "דמי ביטוח בריאות";
const TOTAL_ROW = "סך הכול";
const CELL = new RegExp(String.raw`^\s*(?:(\d{1,2}(?:\.\d{1,2})?)%\s*${DATE}|-(?=\s|$))`);
// Columns: employer, employee, total for the reduced band, then the same for the full band.
const EMPLOYEE_REDUCED = 1;
const EMPLOYEE_FULL = 4;

type Cell = Observed<Bp> | null;

const INVISIBLE = invisibleChars();
const ENTITIES: Record<string, string> = { nbsp: " ", quot: '"', amp: "&", lt: "<", gt: ">", apos: "'" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ");
}

/** Parses the BTL employee-rates page. The page shows only the values in force now. */
export function parseBtl(html: string): BtlResult {
  const text = htmlToText(html);
  const page: BtlPage = {};
  const problems: Problem[] = [];
  const fail = (kind: Problem["kind"], message: string, at = 0) =>
    problems.push({ source: "btl", url: BTL_URL, kind, message, excerpt: excerpt(text, at) });

  for (const [key, re, label] of [
    ["blReducedThresholdMonthly", THRESHOLD, "reduced-rate threshold"],
    ["blCeilingMonthly", CEILING, "maximum insurable income"],
  ] as const) {
    const found = [...text.matchAll(re)].map((m) => ({ value: parseIls(m[1]), effective: m[2], at: m.index ?? 0 }));
    const distinct = new Set(found.map((f) => `${f.value}@${f.effective}`));
    if (found.length === 0) fail("missing", `BTL ${label} ("… - N ש"ח (החל ב- dd.mm.yyyy)") not found`);
    else if (distinct.size > 1) fail("ambiguous", `BTL ${label} candidates: ${[...distinct].join(", ")}`, found[1].at);
    else page[key] = { value: found[0].value, effective: found[0].effective };
  }

  const tables: { reduced: EmployeeRate; full: EmployeeRate; at: number }[] = [];
  let broken = false;
  for (let at = text.indexOf(TABLE_HEADER); at !== -1; at = text.indexOf(TABLE_HEADER, at + 1)) {
    const table = parseRateTable(text.slice(at + TABLE_HEADER.length));
    if ("problem" in table) {
      fail(table.kind, table.problem, at);
      broken = true;
    } else tables.push({ ...table, at });
  }
  const distinct = new Set(tables.map((t) => JSON.stringify([t.reduced, t.full])));
  if (tables.length === 0 && !broken) fail("missing", `BTL rate table header "${TABLE_HEADER}" not found`);
  else if (distinct.size > 1) fail("ambiguous", `${tables.length} BTL rate tables with different values`, tables[1].at);
  else if (!broken) {
    page.blReducedRateBp = tables[0].reduced;
    page.blFullRateBp = tables[0].full;
  }
  return { page, problems };
}

type TableFailure = { problem: string; kind: Problem["kind"] };

/** Reads the NI, health and total rows after the header, or says why it could not. */
function parseRateTable(after: string): { reduced: EmployeeRate; full: EmployeeRate } | TableFailure {
  const body = after.trimStart();
  const health = body.indexOf(HEALTH_ROW);
  const total = body.indexOf(TOTAL_ROW, health);
  if (!body.startsWith(NI_ROW) || health === -1 || total === -1) {
    return { kind: "missing", problem: `BTL rate table: rows "${NI_ROW}", "${HEALTH_ROW}", "${TOTAL_ROW}" not found in order` };
  }
  const rows = [
    cells(body.slice(NI_ROW.length, health)),
    cells(body.slice(health + HEALTH_ROW.length, total)),
    cells(body.slice(total + TOTAL_ROW.length)),
  ];
  if (rows.some((r) => r.length < 6)) return { kind: "missing", problem: "BTL rate table: a row has fewer than 6 cells" };
  const [niCells, healthCells, totalCells] = rows;

  const employee = (col: number): EmployeeRate | TableFailure => {
    const t = totalCells[col];
    if (!t) return { kind: "missing", problem: `BTL rate table: employee total in column ${col + 1} is empty` };
    const niBp = niCells[col]?.value ?? 0;
    const healthBp = healthCells[col]?.value ?? 0;
    if (niBp + healthBp !== t.value) {
      return {
        kind: "mismatch",
        problem: `BTL sum check failed in column ${col + 1}: NI ${niBp / 100}% + health ${healthBp / 100}% ≠ total ${t.value / 100}%`,
      };
    }
    return { ...t, niBp, healthBp };
  };
  const reduced = employee(EMPLOYEE_REDUCED);
  if ("problem" in reduced) return reduced;
  const full = employee(EMPLOYEE_FULL);
  if ("problem" in full) return full;
  return { reduced, full };
}

/** Consecutive table cells ("4.27% (החל ב- 01.01.2025)" or "-") from the start of `s`. */
function cells(s: string): Cell[] {
  const out: Cell[] = [];
  let rest = s;
  for (let m = CELL.exec(rest); m && out.length < 6; m = CELL.exec(rest)) {
    out.push(m[1] ? { value: percentToBp(m[1]), effective: m[2] } : null);
    rest = rest.slice(m[0].length);
  }
  return out;
}

const yearOf = (ddmmyyyy: string): number => Number(ddmmyyyy.slice(6));

/**
 * Which current BTL values describe tax year `year`. Thresholds index each January,
 * so they apply only when effective 01.01 of that year. Rates apply when they took
 * effect in or before that year.
 */
export function btlForYear(page: BtlPage, year: number): { fields: Partial<BtlFields>; skipped: string[] } {
  const fields: Partial<BtlFields> = {};
  const skipped: string[] = [];
  const amounts = ["blReducedThresholdMonthly", "blCeilingMonthly"] as const;
  for (const key of amounts) {
    const o = page[key];
    if (!o) continue;
    if (o.effective === `01.01.${year}`) fields[key] = o.value;
    else skipped.push(`${key}: BTL shows the value effective ${o.effective}, not 01.01.${year}`);
  }
  for (const key of ["blReducedRateBp", "blFullRateBp"] as const) {
    const o = page[key];
    if (!o?.effective) continue;
    if (yearOf(o.effective) <= year) fields[key] = o.value;
    else skipped.push(`${key}: BTL shows the rate effective ${o.effective}, after ${year}`);
  }
  return { fields, skipped };
}
