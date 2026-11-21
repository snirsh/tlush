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

  // Help tooltips are real (hidden) DOM text, so match row labels exactly.
  await expect(page.getByText("Average tax deduction", { exact: true })).toBeVisible();
  await expect(page.getByText("Marginal tax", { exact: true })).toBeVisible();
  await expect(page.getByText("Total net", { exact: true })).toBeVisible();
  await expect(page.getByText("Monthly miluim pay (gross)", { exact: true })).toBeVisible();
  // Some shekel amount appears in the results.
  await expect(page.getByText(/₪[\d,]+\.\d{2}/).first()).toBeVisible();
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
