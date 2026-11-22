import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Accessibility gate: every tab at desktop and phone widths must have no
// serious or critical axe violation. Market and FX hosts are blocked so the
// page always renders its offline fallbacks, and motion is reduced so no
// fade-in is mid-flight when contrast is measured.

const MARKET_HOSTS =
  /^https:\/\/([^/]+\.)?(frankfurter\.app|er-api\.com|corsproxy\.io|allorigins\.win|finance\.yahoo\.com)\//;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const TABS = ["RSU", "ESPP", "Explanation"];

for (const viewport of VIEWPORTS) {
  for (const tab of TABS) {
    test(`axe: ${tab} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.route(MARKET_HOSTS, (route) => route.abort());
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      await page.goto("/");

      await page.getByRole("tab", { name: tab }).click();
      const panel = page.getByRole("tabpanel", { name: tab });
      await expect(panel.getByRole("heading").first()).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
      expect(blocking, "serious/critical axe violations").toEqual([]);
    });
  }
}

// The filled-in state: results, and at phone width the pinned net-to-bank
// summary, only exist once there is a price. Synthetic figures.
for (const viewport of VIEWPORTS) {
  for (const tab of ["RSU", "ESPP"]) {
    test(`axe: ${tab} with results at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.route(MARKET_HOSTS, (route) => route.abort());
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      await page.goto("/");

      await page.getByRole("tab", { name: tab }).click();
      await page.getByRole("checkbox", { name: /set stock price/i }).check();
      await page.getByLabel("Stock price (USD)").fill("150");
      await page.getByRole("heading", { name: "Tlush" }).click(); // leave the field
      await expect(page.getByRole("region", { name: "Results" }).getByText("Net to bank", { exact: true })).toBeAttached();

      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
      expect(blocking, "serious/critical axe violations").toEqual([]);
    });
  }
}

// The phone summary is only up while the results are off screen, so scan it
// explicitly: filled in, back at the top, summary visible.
test("axe: RSU at 390x844 with the results summary up", async ({ page }) => {
  await page.route(MARKET_HOSTS, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("checkbox", { name: /set stock price/i }).check();
  await page.getByLabel("Stock price (USD)").fill("150");
  await page.getByRole("heading", { name: "Tlush" }).click(); // leave the field
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole("link", { name: /See breakdown/ })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect(blocking, "serious/critical axe violations").toEqual([]);
});
