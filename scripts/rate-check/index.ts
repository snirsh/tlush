import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { TAX_YEAR_SPECS } from "../../src/lib/tax/years";
import { BTL_URL, parseBtl, type BtlResult } from "./btl";
import { buildReport, changesFor, yearsToCheck, type Report, type YearInput } from "./compare";
import { excerpt, type Problem, type SourceId } from "./fields";
import { sync } from "./github";
import { bookletUrl, classifyBooklet, parseBooklet, type BookletResult } from "./ita";
import { hasCommand, run } from "./proc";
import { renderText, type FileChange } from "./render";
import { addYearToIndex, renderNewYearFile, rewriteSpecFile } from "./specFile";

const USER_AGENT = "tlush-rate-checker (+https://github.com/snirsh/tlush)";
const TIMEOUT_MS = 30_000;
const YEARS_DIR = "src/lib/tax/years";

const USAGE = `Usage: bun scripts/rate-check/index.ts --dry-run [--year 2026] [--json] [--source ita|btl]

  --dry-run   Fetch, parse, compare, print the report and the would-be diff. No writes, no GitHub calls.
  --year N    Check only tax year N.
  --json      Print the report as JSON.
  --source    Check only one source (ita: the ITA booklet, needs pdftotext; btl: the BTL page).
  --base B    (workflow only) Base branch for the bot PR.`;

interface HttpResult {
  status: number;
  contentType: string;
  bytes: Uint8Array;
}

async function get(url: string): Promise<HttpResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const out = { status: res.status, contentType: res.headers.get("content-type") ?? "", bytes: new Uint8Array(await res.arrayBuffer()) };
      if (res.status < 500 || attempt === 1) return out;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

const networkProblem = (source: SourceId, url: string, e: unknown, year?: number): Problem => ({
  source,
  url,
  year,
  kind: "network",
  message: `Request failed after one retry: ${e instanceof Error ? e.message : String(e)}`,
});

async function pdfToText(pdf: Uint8Array): Promise<string> {
  const r = await run("pdftotext", ["-layout", "-", "-"], pdf);
  if (r.code !== 0) throw new Error(`pdftotext exited ${r.code}: ${r.stderr}`);
  return r.stdout.toString("utf8");
}

async function checkBooklet(year: number): Promise<BookletResult | "absent"> {
  const url = bookletUrl(year);
  let res: HttpResult;
  try {
    res = await get(url);
  } catch (e) {
    return { fields: {}, problems: [networkProblem("ita", url, e, year)] };
  }
  const bodyText = res.contentType.includes("pdf") ? "" : new TextDecoder().decode(res.bytes);
  const kind = classifyBooklet(year, { status: res.status, contentType: res.contentType, bodyText });
  if (kind === "absent") return "absent";
  if (kind !== "pdf") return { fields: {}, problems: [kind] };
  return parseBooklet(await pdfToText(res.bytes), year);
}

async function checkBtl(): Promise<BtlResult> {
  let res: HttpResult;
  try {
    res = await get(BTL_URL);
  } catch (e) {
    return { page: {}, problems: [networkProblem("btl", BTL_URL, e)] };
  }
  const html = new TextDecoder().decode(res.bytes);
  if (res.status !== 200 || !res.contentType.toLowerCase().startsWith("text/html")) {
    const kind = res.status !== 200 ? "http" : "content-type";
    const message = res.status !== 200 ? `Unexpected HTTP ${res.status}` : `Expected text/html, got "${res.contentType}"`;
    return { page: {}, problems: [{ source: "btl", url: BTL_URL, kind, status: res.status, message, excerpt: excerpt(html) }] };
  }
  return parseBtl(html);
}

function fileChanges(report: Report, btl: BtlResult | "skipped"): { changes: FileChange[]; notes: string[] } {
  const page = btl === "skipped" ? {} : btl.page;
  const changes: FileChange[] = [];
  const notes: string[] = [];
  const indexPath = `${YEARS_DIR}/index.ts`;
  const indexBefore = readFileSync(indexPath, "utf8");
  let index = indexBefore;
  for (const y of report.years) {
    const path = `${YEARS_DIR}/${y.year}.ts`;
    if (y.kind === "existing") {
      const diff = changesFor(y);
      if (Object.keys(diff).length === 0) continue;
      const before = readFileSync(path, "utf8");
      const rewrite = rewriteSpecFile(before, diff, page);
      notes.push(...rewrite.notes.map((n) => `${y.year}: ${n}`));
      changes.push({ path, before, after: rewrite.text });
    } else if (y.kind === "new") {
      const previous = TAX_YEAR_SPECS.find((s) => s.year === y.carriedFrom)!;
      changes.push({ path, before: "", after: renderNewYearFile(y.year, y.fields, previous, page) });
      index = addYearToIndex(index, y.year);
    }
  }
  if (index !== indexBefore) changes.push({ path: indexPath, before: indexBefore, after: index });
  return { changes, notes };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      year: { type: "string" },
      source: { type: "string" },
      base: { type: "string", default: "master" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const source = values.source ?? "all";
  if (!["all", "ita", "btl"].includes(source)) {
    console.error(`--source must be ita or btl\n\n${USAGE}`);
    return 2;
  }
  const dryRun = values["dry-run"];
  if (!dryRun && process.env.GITHUB_ACTIONS !== "true") {
    console.error(`Only --dry-run is allowed outside GitHub Actions.\n\n${USAGE}`);
    return 2;
  }
  if (!dryRun && source !== "all") {
    console.error("--source is only allowed with --dry-run, so a partial check never opens a PR or an issue.");
    return 2;
  }
  const withIta = source !== "btl";
  const withBtl = source !== "ita";
  if (withIta && !hasCommand("pdftotext")) {
    console.error(
      "pdftotext not found. The ITA booklet is a PDF and needs poppler's pdftotext.\n" +
        "Install it (Debian/Ubuntu: apt-get install poppler-utils, macOS: brew install poppler),\n" +
        "or run only the BTL check with --source btl.",
    );
    return 2;
  }

  const specYears = TAX_YEAR_SPECS.map((s) => s.year);
  const years = values.year ? [Number(values.year)] : yearsToCheck(specYears, new Date().getUTCFullYear());
  if (years.some((y) => !Number.isInteger(y) || y < 2000)) {
    console.error(`--year must be a 4-digit year\n\n${USAGE}`);
    return 2;
  }

  const btl: BtlResult | "skipped" = withBtl ? await checkBtl() : "skipped";
  const inputs: YearInput[] = [];
  for (const year of years) {
    const booklet = withIta ? await checkBooklet(year) : "skipped";
    inputs.push({ year, spec: TAX_YEAR_SPECS.find((s) => s.year === year), booklet });
  }
  const report = buildReport(inputs, btl, TAX_YEAR_SPECS);
  const { changes, notes } = fileChanges(report, btl);
  const text = renderText(report, changes);

  if (dryRun) {
    console.log(values.json ? JSON.stringify({ report, notes, changes: changes.map((c) => ({ path: c.path, after: c.after })) }, null, 2) : text);
    return 0;
  }

  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const runUrl = `${server}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Rate check\n\n\`\`\`text\n${text}\n\`\`\`\n`);
  console.log(text);
  await sync({ report, changes, notes, btl: btl === "skipped" ? {} : btl.page, base: values.base!, runUrl });
  return 0;
}

process.exit(await main());
