import { createHash } from "node:crypto";
import { BTL_URL, type BtlPage } from "./btl";
import type { Report, YearOutcome } from "./compare";
import { FIELD_KEYS, FIELDS, formatField, type FieldKey, type Fields, type Problem } from "./fields";
import { bookletUrl } from "./ita";
import { CARRIED_OVER } from "./specFile";

export interface FileChange {
  path: string;
  before: string;
  after: string;
}

export interface CommandResult {
  command: string;
  ok: boolean;
  tail: string;
}

const HASH_MARKER = /<!-- rate-checker-hash: ([0-9a-f]+) -->/;

/** Stable fingerprint of findings. Reruns with the same findings produce the same hash. */
export function hashOf(findings: unknown): string {
  return createHash("sha256").update(JSON.stringify(findings)).digest("hex").slice(0, 16);
}

export const hashMarker = (hash: string): string => `<!-- rate-checker-hash: ${hash} -->`;
export const readHash = (body: string): string | undefined => HASH_MARKER.exec(body)?.[1];

const fmt = <K extends FieldKey>(key: K, v: Fields[K] | undefined): string => (v === undefined ? "?" : formatField(key, v));

export function renderText(report: Report, changes: FileChange[], infoNotes: string[] = []): string {
  const out: string[] = [];
  for (const y of report.years) {
    out.push(`== ${y.year}: ${describeOutcome(y)}`);
    if (y.kind === "existing") {
      for (const c of y.checks) {
        const label = FIELDS[c.key].label.padEnd(38);
        if (c.status === "match") out.push(`  ok        ${label} ${fmt(c.key, c.current)}`);
        else if (c.status === "diff") out.push(`  DIFF      ${label} ${fmt(c.key, c.current)}  ->  ${fmt(c.key, c.official)}`);
        else out.push(`  unchecked ${label} ${c.note}`);
      }
    }
    if (y.kind === "new") {
      for (const key of FIELD_KEYS) out.push(`  new       ${FIELDS[key].label.padEnd(38)} ${fmt(key, y.fields[key])}`);
      out.push(`  carried over from ${y.carriedFrom}, not checked: ${CARRIED_OVER.join(", ")}`);
    }
  }
  if (infoNotes.length) out.push("", "== Notes", ...infoNotes.map((note) => `  ${note}`));
  out.push("", report.problems.length ? `== Problems (${report.problems.length})` : "== Problems: none");
  for (const p of report.problems) out.push(`  [${p.source}${p.year ? ` ${p.year}` : ""}] ${p.kind}: ${p.message}`);
  if (changes.length) out.push("", "== Would-be file changes");
  for (const c of changes) out.push(lineDiff(c.path, c.before, c.after));
  return out.join("\n");
}

function describeOutcome(y: YearOutcome): string {
  switch (y.kind) {
    case "existing": {
      const count = (s: string) => y.checks.filter((c) => c.status === s).length;
      const unchecked = count("unchecked") ? `, ${count("unchecked")} unchecked` : "";
      return `${count("match")} match, ${count("diff")} differ${unchecked}`;
    }
    case "new":
      return `new year published, spec file would be created (carried over from ${y.carriedFrom})`;
    case "new-pending":
      return y.reason;
    case "not-published":
      return "no booklet published, nothing to do";
  }
}

const CI_NOTE = `### CI on this PR

This PR was opened with the workflow's \`GITHUB_TOKEN\`, and GitHub does not start other workflows for such PRs, so \`ci.yml\` has not run here. The checker ran \`bun run test\` and \`bun run build\` itself (results above). To run full CI, use **Actions → CI → Run workflow** on \`bot/rate-update\`, or close and reopen this PR, or push any commit to the branch as a human.`;

export function renderPrBody(args: {
  report: Report;
  btl: BtlPage;
  results: CommandResult[];
  notes: string[];
  runUrl: string;
  hash: string;
}): string {
  const { report, btl, results, notes, runUrl, hash } = args;
  const failed = results.filter((r) => !r.ok);
  const out: string[] = [];
  if (failed.length) {
    out.push(
      `> [!WARNING]\n> **${failed.map((r) => `\`${r.command}\``).join(" and ")} failed on this change.** Year-specific tests write the published figures by hand, so a real rate change is expected to break them until they are updated. Check the output below before merging.`,
      "",
    );
  }
  out.push(
    "## Why",
    "",
    "The monthly rate checker compared the official ITA booklet and BTL employee-rates page with `src/lib/tax/years/`. These values changed or a new year was published. Every value below was read from an official page. Nothing was guessed.",
    "",
    "## Changes",
    "",
    "| Year | Field | Spec now | Official |",
    "| --- | --- | --- | --- |",
  );
  for (const y of report.years) {
    if (y.kind === "existing") {
      for (const c of y.checks) {
        if (c.status === "diff") out.push(`| ${y.year} | ${FIELDS[c.key].label} | ${fmt(c.key, c.current)} | **${fmt(c.key, c.official)}** |`);
      }
    }
    if (y.kind === "new") {
      for (const key of FIELD_KEYS) out.push(`| ${y.year} (new) | ${FIELDS[key].label} | none | **${fmt(key, y.fields[key])}** |`);
    }
  }
  const newYears = report.years.filter((y) => y.kind === "new");
  if (newYears.length) {
    out.push("", "## Carried over, not checked by the bot. Verify.", "");
    for (const y of newYears) {
      for (const path of CARRIED_OVER) out.push(`- ${y.year}: \`${path}\` copied from ${y.carriedFrom}`);
    }
  }
  if (notes.length) out.push("", "## Notes", "", ...notes.map((n) => `- ${n}`));
  out.push("", "## Sources", "");
  for (const y of report.years) if (y.kind === "existing" || y.kind === "new") out.push(`- ITA monthly deductions booklet ${y.year}: ${bookletUrl(y.year)}`);
  out.push(`- BTL employee rates: ${BTL_URL}`);
  for (const key of ["blReducedThresholdMonthly", "blCeilingMonthly", "blReducedRateBp", "blFullRateBp"] as const) {
    const o = btl[key];
    if (o) out.push(`  - ${FIELDS[key].label}: ${formatField(key, o.value)}, effective ${o.effective}`);
  }
  if (report.problems.length) {
    out.push("", `Some sources could not be read. Only the fields that parsed unambiguously are in this PR. See the open \`rate-checker\` issue.`);
  }
  out.push("", "## Test and build", "");
  for (const r of results) {
    out.push(`- \`${r.command}\`: ${r.ok ? "passed" : "**FAILED**"}`);
    if (!r.ok) out.push("", "```", r.tail, "```", "");
  }
  out.push("", CI_NOTE, "", `Generated by ${runUrl}. Do not auto-merge.`, "", hashMarker(hash));
  return out.join("\n");
}

export function renderIssueBody(problems: Problem[], runUrl: string, hash: string): string {
  const out = [
    "The monthly rate checker could not verify some official figures. It never guesses a value, so these fields were left unchecked.",
    "",
  ];
  for (const p of problems) {
    out.push(`### ${p.source.toUpperCase()}${p.year ? ` ${p.year}` : ""}: ${p.kind}`, "", p.message, "", `- URL: ${p.url}`);
    if (p.status !== undefined) out.push(`- HTTP status: ${p.status}`);
    if (p.excerpt) out.push("", "```", p.excerpt, "```");
    out.push("");
  }
  out.push(`Last run: ${runUrl}`, "", hashMarker(hash));
  return out.join("\n");
}

/** A minimal unified-style diff (LCS over lines). Enough for the small spec files. */
export function lineDiff(path: string, before: string, after: string): string {
  const a = before === "" ? [] : before.split("\n");
  const b = after.split("\n");
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out = [`--- ${before === "" ? "/dev/null" : `a/${path}`}`, `+++ b/${path}`];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      out.push(`-${String(i + 1).padStart(4)} ${a[i]}`);
      i++;
    } else {
      out.push(`+${String(j + 1).padStart(4)} ${b[j]}`);
      j++;
    }
  }
  return out.join("\n");
}
