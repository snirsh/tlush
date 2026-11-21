import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TAX_YEAR_SPECS } from "../../../src/lib/tax/years";
import type { TaxYearSpec } from "../../../src/lib/tax/types";
import { parseBtl } from "../btl";
import { buildReport, type Report } from "../compare";
import { BOT_BRANCH, checkoutRefusal, sync, type Shell } from "../github";
import { parseBooklet } from "../ita";
import { hashOf, hashMarker, renderPrBody, type FileChange } from "../render";

const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), "utf8");
const spec2026 = TAX_YEAR_SPECS.find((s) => s.year === 2026)!;
const booklet = parseBooklet(fixture("ita-2026-booklet.txt"), 2026);
const btl = parseBtl(fixture("btl-employee-rates.html"));
const RUN = "https://github.com/o/r/actions/runs/1";

const matching = buildReport([{ year: 2026, spec: spec2026, booklet }], btl, TAX_YEAR_SPECS);
const stale: TaxYearSpec = { ...spec2026, nationalInsurance: { ...spec2026.nationalInsurance, ceilingMonthly: 50_695 } };
const differing = buildReport([{ year: 2026, spec: stale, booklet }], btl, TAX_YEAR_SPECS);
const broken = buildReport([{ year: 2026, spec: spec2026, booklet }], parseBtl(fixture("btl-sum-mismatch.html")), TAX_YEAR_SPECS);
const change: FileChange = { path: "src/lib/tax/years/2026.ts", before: "a", after: "b" };

/** Records every command. `open` seeds what `gh pr list` / `gh issue list` return. */
function fakeShell(open: { pr?: { number: number; body: string }; issue?: { number: number; body: string } } = {}, testsPass = true) {
  const calls: string[] = [];
  const bodies: string[] = [];
  const sh: Shell = {
    async exec(cmd, args, stdin) {
      calls.push([cmd, ...args].join(" "));
      if (stdin !== undefined) bodies.push(stdin);
      if (cmd === "gh" && args[1] === "list") return JSON.stringify(args[0] === "pr" ? (open.pr ? [open.pr] : []) : open.issue ? [open.issue] : []);
      return "";
    },
    async check(command) {
      calls.push(`check ${command}`);
      return { command, ok: testsPass || command !== "bun run test", tail: "FAIL yearSpecs.test.ts" };
    },
    writeFile(path) {
      calls.push(`write ${path}`);
    },
  };
  return { sh, calls, bodies };
}

const args = (report: Report, changes: FileChange[] = []) => ({ report, changes, notes: [], btl: btl.page, base: "master", runUrl: RUN });
const mutating = (calls: string[]) => calls.filter((c) => !/^gh (pr|issue) list /.test(c));

describe("checkoutRefusal", () => {
  it("allows a run checked out on the default branch", () => {
    expect(checkoutRefusal("refs/heads/main", "main")).toBeNull();
  });

  it.each([
    ["a feature branch", "refs/heads/chore/rate-checker", "master"],
    ["the bot branch", `refs/heads/${BOT_BRANCH}`, "master"],
    ["a pull request merge ref", "refs/pull/3/merge", "master"],
    ["a tag named like the default branch", "refs/tags/master", "master"],
    ["an unknown ref", undefined, "master"],
  ])("refuses %s", (_case, ref, defaultBranch) => {
    expect(checkoutRefusal(ref, defaultBranch)).toContain("not refs/heads/master");
  });

  it("refuses a missing default branch", () => {
    expect(checkoutRefusal("refs/heads/master", undefined)).toContain("--default-branch is required");
  });

  it("refuses the bot branch as the default branch, so the PR can never target itself", () => {
    expect(checkoutRefusal(`refs/heads/${BOT_BRANCH}`, BOT_BRANCH)).toContain("cannot be the bot branch");
  });
});

describe("sync", () => {
  it("does nothing when everything matches and nothing is open", async () => {
    const { sh, calls } = fakeShell();
    await sync(args(matching), sh);
    expect(mutating(calls)).toEqual([]);
  });

  it("closes the open issue with a link to the run once everything matches", async () => {
    const { sh, calls } = fakeShell({ issue: { number: 7, body: "old" } });
    await sync(args(matching), sh);
    expect(mutating(calls)).toEqual([`gh issue close 7 --comment Resolved by run ${RUN}`]);
  });

  it("tests, builds, force-pushes the bot branch and opens one PR", async () => {
    const { sh, calls } = fakeShell();
    await sync(args(differing, [change]), sh);
    const m = mutating(calls);
    expect(m[0]).toBe(`write ${change.path}`);
    expect(m).toContain("check bun run test");
    expect(m).toContain("check bun run build");
    expect(m).toContain(`git push --force origin HEAD:refs/heads/${BOT_BRANCH}`);
    expect(m.filter((c) => c.startsWith("gh pr create"))).toHaveLength(1);
    expect(m.join("\n")).not.toMatch(/merge|--auto/);
  });

  it("does not push or edit when the open PR already has this run's findings", async () => {
    const { sh, calls } = fakeShell({ pr: { number: 3, body: hashMarker(hashOf(differing.years)) } });
    await sync(args(differing, [change]), sh);
    expect(mutating(calls)).toEqual([]);
  });

  it("updates the existing PR instead of opening a second one when findings change", async () => {
    const { sh, calls } = fakeShell({ pr: { number: 3, body: hashMarker("0000") } });
    await sync(args(differing, [change]), sh);
    expect(mutating(calls).filter((c) => c.startsWith("gh pr"))).toEqual([expect.stringMatching(/^gh pr edit 3 --title /)]);
  });

  it("opens one labelled issue for problems, and leaves it alone on a rerun", async () => {
    const first = fakeShell();
    await sync(args(broken), first.sh);
    expect(mutating(first.calls)).toEqual([
      expect.stringMatching(/^gh label create rate-checker .* --force$/),
      "gh issue create --title Rate checker: could not verify official rates --label rate-checker --body-file -",
    ]);
    const rerun = fakeShell({ issue: { number: 9, body: first.bodies[0] } });
    await sync(args(broken), rerun.sh);
    expect(mutating(rerun.calls)).toEqual([]);
  });

  it("says loudly in the PR body when the tests fail", async () => {
    const { sh, bodies } = fakeShell({}, false);
    await sync(args(differing, [change]), sh);
    expect(bodies[0]).toMatch(/^> \[!WARNING\]\n> \*\*`bun run test` failed on this change/);
    expect(bodies[0]).toContain("FAIL yearSpecs.test.ts");
  });
});

describe("renderPrBody", () => {
  const body = renderPrBody({ report: differing, btl: btl.page, results: [], notes: [], runUrl: RUN, hash: "abc" });

  it("shows the old and new value, the sources with effective dates, and the CI note", () => {
    expect(body).toContain("| 2026 | BL ceiling (monthly) | 50,695 | **51,910** |");
    expect(body).toContain("monthly-deductions-booklet-2026.pdf");
    expect(body).toContain("BL ceiling (monthly): 51,910, effective 01.01.2026");
    expect(body).toContain("Actions → CI → Run workflow");
    expect(body).toContain(hashMarker("abc"));
  });
});
