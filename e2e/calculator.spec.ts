import { expect, test } from "@playwright/test";

// Real-browser smoke tests. They exercise the manual-override path so they are
// deterministic regardless of whether the live market APIs are reachable from
// the runner. Exact figures depend on the live FX rate, so we assert that the
// result rows render rather than pinning shekel amounts (the unit/jsdom suites
// pin the exact numbers with a fixed fallback rate).

test("loads and shows the calculator", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Tlush/i }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "RSU" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "ESPP" })).toBeVisible();
});

test("RSU: manual price produces after-tax results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: /set stock price/i }).check();
  await page.getByLabel("Stock price (USD)").fill("200");
  await page.getByLabel(/^Grant price \(USD\)/).fill("200");

  // Help tooltips are real (hidden) DOM text, so match row labels exactly.
  await expect(page.getByText("Average tax deduction", { exact: true })).toBeVisible();
  await expect(page.getByText("Marginal tax", { exact: true })).toBeVisible();
  await expect(page.getByText("Total net", { exact: true })).toBeVisible();
  await expect(page.getByText("Monthly miluim pay (gross)", { exact: true })).toBeVisible();
  // Some shekel amount appears in the results.
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByText(/₪[\d,]+\.\d{2}/).first()).toBeVisible();
});

test("ESPP: trustee toggle switches the result rows", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "ESPP" }).click();
  await page.getByRole("checkbox", { name: /set stock price/i }).check();
  await page.getByLabel("Stock price (USD)").fill("80");

  await expect(page.getByText("Gross investment", { exact: true })).toBeVisible();
  await expect(page.getByText("Capital tax", { exact: true })).toBeVisible();

  // Turning off the trustee reveals the "tax withheld at purchase" row.
  await page.getByRole("checkbox", { name: /With Trustee/i }).uncheck();
  await expect(page.getByText("Tax on discount (paid)", { exact: true })).toBeVisible();
});

test("Explanation tab documents the fields", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Explanation" }).click();
  await expect(
    page.getByRole("heading", { name: "Explanation" }),
  ).toBeVisible();
  await expect(page.getByText(/Section 102/).first()).toBeVisible();
});

test.describe("phone results summary", () => {
  const MARKET_HOSTS =
    /^https:\/\/([^/]+\.)?(frankfurter\.app|er-api\.com|corsproxy\.io|allorigins\.win|finance\.yahoo\.com)\//;

  async function fill(page: import("@playwright/test").Page, width: number, height: number) {
    await page.route(MARKET_HOSTS, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("checkbox", { name: /set stock price/i }).check();
    await page.getByLabel("Stock price (USD)").fill("150");
    await page.getByLabel(/^Grant price \(USD\)/).fill("150");
  }

  test("at 390px sits above the fold, steps aside while typing, and jumps to the results", async ({ page }) => {
    await fill(page, 390, 844);
    const summary = page.getByRole("link", { name: /^Net to bank ₪[\d,]+\.\d{2} See breakdown$/ });

    // The price field is focused (keyboard up): the summary stays out of the way.
    await expect(summary).toBeHidden();

    await page.getByRole("heading", { name: "Tlush" }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(summary).toBeVisible();
    const box = (await summary.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(box.height).toBeGreaterThanOrEqual(44);

    // A tapped checkbox raises no keyboard, so it keeps the summary up.
    await page.getByRole("checkbox", { name: /what if 2 years pass/i }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole("checkbox", { name: /what if 2 years pass/i })).toBeFocused();
    await expect(summary).toBeVisible();

    await summary.click();
    const results = page.getByRole("region", { name: "Results" });
    await expect(results).toBeFocused();
    await expect(results).toBeInViewport();
    // With the breakdown on screen the summary has nothing left to point at.
    await expect(summary).toBeHidden();
  });

  test("at 1440px adds nothing: the results column is already in view", async ({ page }) => {
    await fill(page, 1440, 900);
    await page.getByRole("heading", { name: "Tlush" }).click();
    await expect(page.getByRole("region", { name: "Results" })).toBeInViewport();
    await expect(page.locator(".results-jump")).toBeHidden();
  });
});

test.describe("phone results summary never covers what you need", () => {
  const MARKET_HOSTS =
    /^https:\/\/([^/]+\.)?(frankfurter\.app|er-api\.com|corsproxy\.io|allorigins\.win|finance\.yahoo\.com)\//;

  // Below 920px, plus a 34px bottom inset (an iPhone home indicator) simulated
  // by padding the bar, since Chromium has no env(safe-area-inset-bottom).
  const CASES = [
    { width: 390, height: 844, inset: 0 },
    { width: 390, height: 844, inset: 34 },
    { width: 700, height: 1000, inset: 0 },
    { width: 919, height: 1000, inset: 0 },
  ];

  for (const { width, height, inset } of CASES) {
    test(`at ${width}x${height}${inset ? ` with a ${inset}px inset` : ""}`, async ({ page }) => {
      await page.route(MARKET_HOSTS, (route) => route.abort());
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height });
      await page.goto("/");
      if (inset) await page.addStyleTag({ content: `.results-jump { padding-bottom: ${10 + inset}px !important; }` });
      await page.getByRole("checkbox", { name: /set stock price/i }).check();
      await page.getByLabel("Stock price (USD)").fill("150");
      await page.getByLabel(/^Grant price \(USD\)/).fill("150");
      await page.getByRole("heading", { name: "Tlush" }).click();
      const bar = page.locator(".results-jump");
      const resultsOnScreen = () =>
        page.evaluate(() => {
          const r = document.getElementById("results")!.getBoundingClientRect();
          return r.top < innerHeight && r.bottom > 0;
        });

      // Scrolling the whole page: the bar is only ever up while the results
      // are entirely off screen, and it is gone at the bottom of the page.
      const end = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (let y = 0; y < end; y += 200) {
        await page.evaluate((y) => scrollTo(0, y), y);
        await expect.poll(async () => (await bar.isVisible()) && (await resultsOnScreen())).toBe(false);
      }
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await expect(bar).toBeHidden();

      // Tabbing through every input: no focused control is left under it. (The
      // first row tabbed into the results can be scrolled to the bottom edge;
      // the bar drops away on the next observer callback, hence the poll.)
      await page.evaluate(() => scrollTo(0, 0));
      await page.getByRole("tabpanel").focus();
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press("Tab");
        const overlap = () =>
          page.evaluate(() => {
            const el = document.activeElement!;
            const jump = document.querySelector(".results-jump")!;
            if (el === jump || getComputedStyle(jump).visibility === "hidden") return false;
            const a = el.getBoundingClientRect();
            const b = jump.getBoundingClientRect();
            return a.bottom > b.top && a.top < b.bottom;
          });
        await expect.poll(overlap, { message: `focus #${i} stays under the summary` }).toBe(false);
        if (await page.evaluate(() => !!document.activeElement?.closest("#results"))) break;
      }
    });
  }
});

test("phone results summary: out of the tab order while hidden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("checkbox", { name: /set stock price/i }).check();
  await page.getByLabel("Stock price (USD)").fill("150");
  await page.getByLabel(/^Grant price \(USD\)/).fill("150");
  const summary = page.getByRole("link", { name: /See breakdown/ });
  const panel = page.getByRole("tabpanel", { name: "RSU" });

  // Hidden by keyboard focus in the inputs: Shift+Tab from the first input
  // goes straight back to the panel, past the (hidden) summary.
  await panel.focus();
  await page.keyboard.press("Tab");
  await expect(summary).toBeFocused(); // up, so reachable
  await page.keyboard.press("Tab");
  await expect(summary).toBeHidden(); // focus now in the inputs
  await page.keyboard.press("Shift+Tab");
  await expect(panel).toBeFocused();

  // Hidden because the results are on screen: Tab from the panel skips it.
  await page.getByRole("region", { name: "Results" }).scrollIntoViewIfNeeded();
  await expect(summary).toBeHidden();
  await panel.evaluate((el) => el.focus({ preventScroll: true }));
  await page.keyboard.press("Tab");
  await expect(page.locator(".results-jump")).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.closest(".inputs-col") !== null)).toBe(true);
});
