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
