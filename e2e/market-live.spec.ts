import { expect, test, type Page } from "@playwright/test";

// The live path through /api/quote, answered by e2e/fixtures/yahoo.ts (WIX at
// $150, closing at $100 before any grant date; POLI.TA at 1,234 agorot).
// Every other host is blocked and recorded: market data comes only from our origin.
const FX_HOSTS = ["api.frankfurter.app", "open.er-api.com"];

async function open(page: Page) {
  const thirdParty: string[] = [];
  await page.route(
    (url) => url.hostname !== "localhost",
    (route) => {
      thirdParty.push(new URL(route.request().url()).hostname);
      return route.abort();
    },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  return thirdParty;
}

test("RSU: a symbol fills the live price and the grant-date average", async ({ page }) => {
  const thirdParty = await open(page);
  await page.getByLabel("Grant date").fill("2024-01-15");
  await page.getByLabel("Stock symbol").fill("WIX");

  await expect(page.getByRole("status").filter({ hasText: "Live price" })).toHaveText("Live price: $150.00");
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByText("Net to bank", { exact: true })).toBeVisible();
  await expect(results.locator(".result-head", { hasText: "Grant price" })).toContainText("$100.00");
  expect(thirdParty.filter((host) => !FX_HOSTS.includes(host))).toEqual([]);
});

test("a Tel Aviv listing is priced in shekels", async ({ page }) => {
  await open(page);
  await page.getByLabel("Stock symbol").fill("POLI.TA");
  await expect(page.getByRole("status").filter({ hasText: "Live price" })).toHaveText("Live price: ₪12.34");
});

test("an unknown symbol shows the failure state", async ({ page }) => {
  await open(page);
  await page.getByLabel("Stock symbol").fill("NOPE");
  await expect(page.getByRole("status").filter({ hasText: "NOPE" })).toHaveText(
    "Couldn't fetch the live price for NOPE. Enter it below.",
  );
});

test("symbol search suggests from /api/quote", async ({ page }) => {
  await open(page);
  await page.getByLabel("Stock symbol").fill("WI");
  await expect(page.locator(".symbol-list")).toContainText("Wix (fixture)");
  await expect(page.locator(".symbol-list")).not.toContainText("OPR");
});
