import { excerpt, invisibleChars, parseIls, percentToBp, type Bracket, type Fields, type Problem } from "./fields";

export const bookletUrl = (year: number): string =>
  `https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-${year}.pdf`;

type ItaFields = Pick<Fields, "brackets" | "surtaxThresholdAnnual" | "creditPointMonthly">;

export interface BookletResult {
  fields: Partial<ItaFields>;
  problems: Problem[];
}

/**
 * 404 is the normal "not published yet" answer. Only an unspecced next-year probe
 * treats 200 non-PDF as absent; once that year is current, strict handling catches
 * any hidden publication at the latest on Jan 1.
 */
export function classifyBooklet(
  year: number,
  res: { status: number; contentType: string; bodyText: string },
  isNextYearProbe = false,
): "pdf" | "absent" | Problem {
  const url = bookletUrl(year);
  if (res.status === 404) return "absent";
  if (res.status !== 200) {
    return { source: "ita", url, year, kind: "http", status: res.status, message: `Unexpected HTTP ${res.status}`, excerpt: excerpt(res.bodyText) };
  }
  if (!res.contentType.toLowerCase().startsWith("application/pdf")) {
    if (isNextYearProbe) return "absent";
    return {
      source: "ita",
      url,
      year,
      kind: "content-type",
      status: res.status,
      message: `Expected application/pdf, got "${res.contentType}"`,
      excerpt: excerpt(res.bodyText),
    };
  }
  return "pdf";
}

const BIDI = invisibleChars();

export const stripBidi = (text: string): string => text.replace(BIDI, "");

const TABLE_HEADING_STEM = "שיעורי המס החלים";
const BRACKETS_HEADING = `${TABLE_HEADING_STEM} על הכנסה מיגיעה אישית`;
// A row of the annual column: rate first, then the bracket's upper bound.
const BRACKET_ROW = /^\s*(\d{1,2}(?:\.\d{1,2})?)%\s+(\d{1,3}(?:,\d{3})+)\s/;
const BRACKET_CELL = /(\d{1,2}(?:\.\d{1,2})?)%\s+(\d{1,3}(?:,\d{3})+)/;
const TOP_ROW = /^\s*(\d{1,2}(?:\.\d{1,2})?)%\s+מכל שקל נוסף/;
const SURTAX = /עלתה על\s*₪?\s*(\d{1,3}(?:,\d{3})+)/g;
const SURTAX_PER_YEAR = /₪\s*(\d{1,3}(?:,\d{3})+)\s*לשנה\)/g;
const CREDIT_POINT_LINE = /נקודת זיכוי\s*33א/;
const PER_MONTH_AMOUNT = /לחודש\s+(\d{1,3}(?:,\d{3})*)\s/;
const YEAR_HEADING = /להלן שיעורי המס לשנת\D{0,4}(\d{4})/;

/** Parses `pdftotext -layout` output of one year's ITA monthly deductions booklet. */
export function parseBooklet(rawText: string, year: number): BookletResult {
  const text = stripBidi(rawText);
  const url = bookletUrl(year);
  const fields: Partial<ItaFields> = {};
  const problems: Problem[] = [];
  const fail = (kind: Problem["kind"], message: string, at = 0) =>
    problems.push({ source: "ita", url, year, kind, message, excerpt: excerpt(text, at) });

  const heading = YEAR_HEADING.exec(text);
  if (!heading) {
    fail("missing", 'Year heading "להלן שיעורי המס לשנת <year>" not found');
    return { fields, problems };
  }
  if (Number(heading[1]) !== year) {
    fail("mismatch", `Booklet heading says ${heading[1]}, expected ${year}`, heading.index);
    return { fields, problems };
  }

  const { tables, refused } = bracketTables(text);
  const distinct = new Set(tables.map((t) => JSON.stringify(t.brackets)));
  if (refused.length > 0) {
    fail("mismatch", refused.join("; "), text.indexOf(BRACKETS_HEADING));
  } else if (tables.length === 0) {
    fail("missing", `Annual bracket table under "${BRACKETS_HEADING}" not found or incomplete`);
  } else if (distinct.size > 1) {
    fail("ambiguous", `${tables.length} bracket tables with different values`, tables[1].at);
  } else {
    fields.brackets = tables[0].brackets;
  }

  const surtax = unique([...matchAll(text, SURTAX), ...matchAll(text, SURTAX_PER_YEAR)]);
  if (surtax.values.length === 0) fail("missing", "Surtax §121B threshold (\"עלתה על ₪ …\") not found");
  else if (surtax.values.length > 1) fail("ambiguous", `Surtax threshold candidates: ${surtax.values.join(", ")}`, surtax.at);
  else fields.surtaxThresholdAnnual = surtax.values[0];

  const lines = text.split("\n");
  const credit = unique(
    lines.flatMap((line) => {
      const m = CREDIT_POINT_LINE.test(line) ? PER_MONTH_AMOUNT.exec(line + " ") : null;
      return m ? [{ value: parseIls(m[1]), at: text.indexOf(line) }] : [];
    }),
  );
  if (credit.values.length === 0) fail("missing", 'Credit point line ("נקודת זיכוי 33א … לחודש") not found');
  else if (credit.values.length > 1) fail("ambiguous", `Credit point candidates: ${credit.values.join(", ")}`, credit.at);
  else fields.creditPointMonthly = credit.values[0];

  return { fields, problems };
}

/**
 * Each complete annual table: rows after the heading, ended by the "47% on every
 * extra shekel" row. Every row also carries the monthly column, and the booklet's
 * annual bound is exactly 12 times the monthly one. A row that breaks that rule
 * means the columns were not read as expected, so the whole table is refused.
 */
function bracketTables(text: string): { tables: { brackets: Bracket[]; at: number }[]; refused: string[] } {
  const tables: { brackets: Bracket[]; at: number }[] = [];
  const refused: string[] = [];
  let from = text.indexOf(BRACKETS_HEADING);
  while (from !== -1) {
    const brackets: Bracket[] = [];
    for (const line of text.slice(from).split("\n").slice(1, 15)) {
      // The next table ("…שאינה מיגיעה אישית") has the same row shape, so never read past its heading.
      if (line.includes(TABLE_HEADING_STEM)) break;
      if (!line.includes("%")) continue;
      const top = TOP_ROW.exec(line);
      if (top) {
        brackets.push({ upTo: null, rateBp: percentToBp(top[1]) });
        break;
      }
      const row = BRACKET_ROW.exec(line);
      if (!row) break;
      const bracket = { upTo: parseIls(row[2]), rateBp: percentToBp(row[1]) };
      const monthly = BRACKET_CELL.exec(line.slice(row[0].length));
      if (!monthly || percentToBp(monthly[1]) !== bracket.rateBp || parseIls(monthly[2]) * 12 !== bracket.upTo) {
        refused.push(`bracket row "${line.trim()}": annual bound is not 12 × the monthly bound at the same rate`);
        brackets.length = 0;
        break;
      }
      brackets.push(bracket);
    }
    if (isCompleteTable(brackets)) tables.push({ brackets, at: from });
    from = text.indexOf(BRACKETS_HEADING, from + 1);
  }
  return { tables, refused };
}

function isCompleteTable(bs: Bracket[]): boolean {
  if (bs.length < 2 || bs[bs.length - 1].upTo !== null) return false;
  return bs.every((b, i) => i === 0 || (b.rateBp > bs[i - 1].rateBp && (b.upTo === null || b.upTo > bs[i - 1].upTo!)));
}

function matchAll(text: string, re: RegExp): { value: number; at: number }[] {
  return [...text.matchAll(re)].map((m) => ({ value: parseIls(m[1]), at: m.index ?? 0 }));
}

function unique(found: { value: number; at: number }[]): { values: number[]; at: number } {
  const values = [...new Set(found.map((f) => f.value))];
  return { values, at: found[1]?.at ?? found[0]?.at ?? 0 };
}
