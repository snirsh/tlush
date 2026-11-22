import { expect, test, type Page } from "@playwright/test";

// Every third-party host is unreachable and /api/quote answers 502, the way it
// does when Yahoo is down: the live price and the grant-date history both fail.
// Synthetic inputs.
async function offline(page: Page) {
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route("**/api/quote?*", (route) =>
    route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"upstream"}' }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
}

async function failQuote(page: Page) {
  const symbol = page.getByLabel("Stock symbol");
  await symbol.fill("WIX");
  await expect(page.getByRole("status").filter({ hasText: "WIX" })).toHaveText(
    "Couldn't fetch the live price for WIX. Enter it below.",
  );
  return symbol;
}

test("RSU: a failed lookup asks for both prices and never guesses the grant price", async ({ page }) => {
  await offline(page);
  await page.getByLabel("Grant date").fill("2024-01-15");
  const symbol = await failQuote(page);

  await expect(page.getByRole("checkbox", { name: /set stock price/i })).toBeChecked();
  await expect(symbol).toBeFocused();

  await page.getByLabel("Stock price (USD)").fill("150");
  const grant = page.getByLabel(/^Grant price \(USD\)/);
  await expect(grant).toHaveAccessibleDescription(
    /Couldn't fetch the grant-date price\. Enter the 30-day average before the grant date\./,
  );
  await expect(grant).toHaveAttribute("aria-invalid", "true");
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByText("Net to bank", { exact: true })).toHaveCount(0);
  await expect(results.getByText("$150.00")).toHaveCount(0);

  await grant.fill("100");
  await expect(results.getByText("Net to bank", { exact: true })).toBeVisible();
  await expect(results.locator(".result-head", { hasText: "Grant price" })).toContainText("$100.00");
});

test("RSU: the combined total waits for every grant's grant price", async ({ page }) => {
  await offline(page);
  await page.getByRole("checkbox", { name: /set stock price/i }).check();
  await page.getByLabel("Stock price (USD)").fill("150");
  await page.getByLabel(/^Grant price \(USD\)/).fill("100");
  await page.getByRole("button", { name: /add another grant/i }).click();
  const second = page.locator("section.grant", { has: page.getByRole("heading", { name: "RSU grant 2" }) });
  await second.getByRole("checkbox", { name: /set stock price/i }).check();
  await second.getByLabel("Stock price (USD)").fill("150");

  const combined = page.locator("section.results-panel", { has: page.getByRole("heading", { name: "Combined total" }) });
  await expect(combined).toContainText(/grant 2/i);
  await expect(combined.getByText("Net to bank", { exact: true })).toHaveCount(0);
  await expect(page.locator(".results-jump")).toHaveCount(0);

  await second.getByLabel(/^Grant price \(USD\)/).fill("100");
  await expect(combined.getByText("Net to bank", { exact: true })).toBeVisible();
});

test("ESPP: a failed lookup opens the manual price without moving focus", async ({ page }) => {
  await offline(page);
  await page.getByRole("tab", { name: "ESPP" }).click();
  const symbol = await failQuote(page);
  await expect(page.getByRole("checkbox", { name: /set stock price/i })).toBeChecked();
  await expect(symbol).toBeFocused();
});
