import { expect, test, type Page } from "@playwright/test";

// The phone summary bar is hidden while a text field has focus. Pressing a
// control in the bar's bottom band moves focus out of the field, which brings
// the bar back; it must not come back under the press and swallow its release.

const THIRD_PARTY = /^https:\/\/([^/]+\.)?(frankfurter\.app|er-api\.com)\//;
const WIDTH = 390;
const HEIGHT = 844;
const BAND = 64;

test.use({ viewport: { width: WIDTH, height: HEIGHT }, isMobile: true, hasTouch: true });

type Press = (page: Page, x: number, y: number) => Promise<void>;

const PRESSES: Record<string, Press> = {
  "touch tap": (page, x, y) => page.touchscreen.tap(x, y),
  "touch held 150ms": async (page, x, y) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(150);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  },
  "mouse click": async (page, x, y) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  },
  "mouse held 150ms": async (page, x, y) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
  },
};

async function pressFromField(page: Page, motion: "reduce" | "no-preference", control: string, press: Press) {
  await page.route(THIRD_PARTY, (route) => route.abort());
  await page.route("**/api/quote**", (route) => route.fulfill({ status: 502, body: "" }));
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto("/");
  await page.getByRole("checkbox", { name: /set stock price/i }).check();
  await page.getByLabel("Stock price (USD)").fill("150");
  const grantPrice = page.getByLabel(/^Grant price \(USD\)/);
  await grantPrice.fill("150");

  const button = page.getByRole("button", { name: control });
  await button.evaluate((el, band) => {
    const r = el.getBoundingClientRect();
    scrollBy(0, r.top + r.height / 2 - (innerHeight - band / 2));
  }, BAND);
  const box = (await button.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  expect(y, "the button sits in the summary bar's band").toBeGreaterThan(HEIGHT - BAND);
  await expect(grantPrice).toBeFocused();
  await expect(page.locator(".results-jump")).toBeHidden();

  await press(page, x, y);
}

for (const motion of ["reduce", "no-preference"] as const) {
  for (const [name, press] of Object.entries(PRESSES)) {
    test(`phone summary bar lets a ${name} on "+ Add another grant" through (reduced motion: ${motion})`, async ({ page }) => {
      await pressFromField(page, motion, "+ Add another grant", press);
      await expect(page.locator(".inputs-col").getByRole("heading", { name: "RSU grant 2" })).toBeVisible();
    });
  }
}

test("phone summary bar comes back after a press in its band that keeps the result", async ({ page }) => {
  await pressFromField(page, "reduce", "+ Customize sale fees", PRESSES["touch tap"]);
  await expect(page.getByRole("button", { name: "− Hide sale fees" })).toBeVisible();
  await expect(page.locator(".results-jump")).toBeVisible();
});

test("phone summary bar comes back after a touch scroll from a focused field", async ({ page }) => {
  await pressFromField(page, "reduce", "+ Customize sale fees", async (page, x, y) => {
    const cdp = await page.context().newCDPSession(page);
    const before = await page.evaluate(() => scrollY);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 30 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect.poll(() => page.evaluate(() => scrollY), { message: "the drag scrolled" }).not.toBe(before);
  });
  await expect(page.getByRole("button", { name: "+ Customize sale fees" })).toBeVisible();
  await page.getByRole("heading", { name: "Tlush" }).tap();
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator(".results-jump")).toBeVisible();
});
