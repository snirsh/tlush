import type { TaxYearSpec } from "../../src/lib/tax/types";
import { BTL_URL, type BtlPage } from "./btl";
import { bpToFraction, formatIls, type Bp, type Bracket, type Fields } from "./fields";
import { bookletUrl } from "./ita";

const intLiteral = (n: number): string => formatIls(n).replace(/,/g, "_");
const rateLiteral = (bp: Bp): string => String(bpToFraction(bp));
const pct = (bp: Bp): string => `${bp / 100}%`;
const bracketLiteral = (b: Bracket): string =>
  `{ upTo: ${b.upTo === null ? "Infinity" : intLiteral(b.upTo)}, rate: ${rateLiteral(b.rateBp)} }`;

const BRACKET = /\{ upTo: (?:[\d_]+|Infinity), rate: [\d.]+ \}/g;

function replaceOnce(src: string, re: RegExp, replace: (...groups: string[]) => string): string {
  const hits = src.match(new RegExp(re.source, "g"))?.length ?? 0;
  if (hits !== 1) throw new Error(`expected exactly one match for ${re} in the spec file, found ${hits}`);
  return src.replace(re, (_m, ...groups: string[]) => replace(...groups));
}

export interface Rewrite {
  text: string;
  notes: string[];
}

/** Rewrites only the literals of `changes` in an existing year file, keeping comments and layout. */
export function rewriteSpecFile(src: string, changes: Partial<Fields>, btl: BtlPage = {}): Rewrite {
  let text = src;
  const notes: string[] = [];

  if (changes.brackets) {
    const next = changes.brackets;
    const found = [...text.matchAll(BRACKET)];
    if (found.length === next.length) {
      let i = 0;
      text = text.replace(BRACKET, () => bracketLiteral(next[i++]));
    } else {
      const start = found[0].index!;
      const end = found[found.length - 1].index! + found[found.length - 1][0].length;
      const indent = /[ \t]*$/.exec(text.slice(0, start))![0];
      text = text.slice(0, start) + next.map(bracketLiteral).join(`,\n${indent}`) + text.slice(end);
      notes.push(`Bracket count changed from ${found.length} to ${next.length}. Comments inside the bracket list were removed. Review them.`);
    }
  }
  if (changes.surtaxThresholdAnnual !== undefined) {
    const next = changes.surtaxThresholdAnnual;
    let old = "";
    text = replaceOnce(text, /(thresholdAnnual:\s*)([\d_]+)/, (pre, value) => {
      old = value;
      return pre + intLiteral(next);
    });
    text = text.replaceAll(formatIls(Number(old.replace(/_/g, ""))), formatIls(next));
  }
  if (changes.creditPointMonthly !== undefined) {
    const next = changes.creditPointMonthly;
    text = replaceOnce(text, /(monthlyValue:\s*)([\d_]+)/, (pre) => pre + intLiteral(next));
  }
  if (changes.blReducedThresholdMonthly !== undefined) {
    const next = changes.blReducedThresholdMonthly;
    text = replaceOnce(text, /(reducedThresholdMonthly:\s*)([\d_]+)/, (pre) => pre + intLiteral(next));
  }
  if (changes.blCeilingMonthly !== undefined) {
    const next = changes.blCeilingMonthly;
    text = replaceOnce(text, /(ceilingMonthly:\s*)([\d_]+)/, (pre) => pre + intLiteral(next));
  }
  for (const [key, field, parts] of [
    ["blReducedRateBp", "reducedRate", btl.blReducedRateBp],
    ["blFullRateBp", "fullRate", btl.blFullRateBp],
  ] as const) {
    const next = changes[key];
    if (next === undefined) continue;
    const re = new RegExp(String.raw`(\b${field}:\s*)([\d.]+)(,[ \t]*\/\/[ \t]*[\d.]+% NI \+ [\d.]+% health)?`);
    text = replaceOnce(text, re, (pre, _value, comment) => {
      const breakdown = parts && parts.value === next ? `, // ${pct(parts.niBp)} NI + ${pct(parts.healthBp)} health` : "";
      return pre + rateLiteral(next) + (comment === undefined ? "" : breakdown || comment);
    });
  }
  return { text, notes };
}

/** A fresh year file. Values not on the checked pages are carried over from `previous` and marked. */
export function renderNewYearFile(year: number, fields: Fields, previous: TaxYearSpec, btl: BtlPage): string {
  const carried = `// Carried over from ${previous.year}. Not on the pages the rate checker reads. Verify.`;
  const reduced = btl.blReducedRateBp;
  const full = btl.blFullRateBp;
  const breakdown = (p: typeof reduced) => (p ? ` // ${pct(p.niBp)} NI + ${pct(p.healthBp)} health` : "");
  const top = fields.brackets[fields.brackets.length - 1];
  const brackets = fields.brackets.map((b) => {
    const line = `      ${bracketLiteral(b)},`;
    return b === top
      ? `      // ${pct(top.rateBp)} on every additional shekel. The ${pct(Math.round(previous.surtax.rate * 10_000))} above ${formatIls(fields.surtaxThresholdAnnual)} is the separate\n      // section 121B surtax below.\n${line}`
      : line;
  });
  const effective = [
    btl.blReducedThresholdMonthly && `threshold from ${btl.blReducedThresholdMonthly.effective}`,
    btl.blCeilingMonthly && `ceiling from ${btl.blCeilingMonthly.effective}`,
    reduced && `reduced rate from ${reduced.effective}`,
    full && `full rate from ${full.effective}`,
  ].filter(Boolean);

  return `import type { TaxYearSpec } from "../types";

export const TAX_YEAR_${year}: TaxYearSpec = {
  year: ${year},
  incomeTax: {
    // Source: ITA monthly deductions booklet ${year}
    // ${bookletUrl(year)}
    brackets: [
${brackets.join("\n")}
    ],
  },
  nationalInsurance: {
    // Source: BTL employee rates (${effective.join(", ")})
    // ${BTL_URL}
    reducedThresholdMonthly: ${intLiteral(fields.blReducedThresholdMonthly)},
    reducedRate: ${rateLiteral(fields.blReducedRateBp)},${breakdown(reduced)}
    fullRate: ${rateLiteral(fields.blFullRateBp)},${breakdown(full)}
    ceilingMonthly: ${intLiteral(fields.blCeilingMonthly)},
  },
  surtax: {
    // Source: ITA monthly deductions booklet ${year} (link above)
    thresholdAnnual: ${intLiteral(fields.surtaxThresholdAnnual)},
    ${carried}
    rate: ${previous.surtax.rate},
    capitalExtraRate: ${previous.surtax.capitalExtraRate},
  },
  capitalGains: {
    ${carried}
    section102CapitalRate: ${previous.capitalGains.section102CapitalRate},
  },
  creditPoint: {
    // Source: ITA monthly deductions booklet ${year}, section "סכומים מתואמים" (link above)
    monthlyValue: ${intLiteral(fields.creditPointMonthly)},
  },
};
`;
}

/** Adds the import and the array entry for `year` to years/index.ts. No-op if already present. */
export function addYearToIndex(src: string, year: number): string {
  const name = `TAX_YEAR_${year}`;
  if (src.includes(`from "./${year}"`)) return src;
  const imports = [...src.matchAll(/^import \{ TAX_YEAR_\d{4} \} from "\.\/\d{4}";$/gm)];
  const entries = [...src.matchAll(/^([ \t]+)TAX_YEAR_\d{4},$/gm)];
  if (imports.length === 0 || entries.length === 0) throw new Error("years/index.ts does not have the expected layout");
  const lastEntry = entries[entries.length - 1];
  const entryEnd = lastEntry.index! + lastEntry[0].length;
  let text = `${src.slice(0, entryEnd)}\n${lastEntry[1]}${name},${src.slice(entryEnd)}`;
  const lastImport = imports[imports.length - 1];
  const importEnd = lastImport.index! + lastImport[0].length;
  text = `${text.slice(0, importEnd)}\nimport { ${name} } from "./${year}";${text.slice(importEnd)}`;
  return text;
}

/** Carried-over spec paths in a new year file, for the PR body. */
export const CARRIED_OVER = ["surtax.rate", "surtax.capitalExtraRate", "capitalGains.section102CapitalRate"] as const;
