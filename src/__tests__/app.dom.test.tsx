// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import { readFileSync } from "node:fs";

const stylesheet = readFileSync("src/styles.css", "utf8");

// Drive the real UI in a DOM. Network is stubbed to fail so the app falls back
// to its offline behaviour (FX = 3.7, no live quotes) and we use the manual
// price overrides — exactly the path a user has when APIs are unreachable.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline in test"))),
  );
});

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("style").forEach((s) => s.remove());
  vi.unstubAllGlobals();
});

describe("landmarks", () => {
  it("puts the calculator in main between the banner and the footer", () => {
    render(<App />);
    const main = screen.getByRole("main");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(main).toContainElement(screen.getByRole("tablist"));
    expect(main).toContainElement(screen.getByRole("heading", { name: "General inputs" }));
  });
});

describe("RSU calculator UI", () => {
  it("renders after-tax results from manual inputs", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Turn on the manual price override and enter a price.
    await user.click(screen.getByRole("checkbox", { name: /set stock price/i }));
    const price = screen.getByLabelText("Stock price (USD)");
    await user.clear(price);
    await user.type(price, "200");

    // Results render with gross = price × shares × fallback FX (3.7).
    // 200 × 100 × 3.7 = ₪74,000.00
    await waitFor(() =>
      expect(screen.getByText("₪74,000.00")).toBeInTheDocument(),
    );
    expect(screen.getByText("Average tax deduction")).toBeInTheDocument();
    expect(screen.getByText("Total net")).toBeInTheDocument();
    expect(screen.getByText("Marginal tax")).toBeInTheDocument();
    expect(screen.getByText(/Monthly miluim pay/i)).toBeInTheDocument();
  });
});

describe("market lookups", () => {
  it("sends no request until the user first interacts, then fetches the live FX rate", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://api.frankfurter.app/latest")
        ? new Response(JSON.stringify({ rates: { ILS: 3.5 } }))
        : Promise.reject(new Error("offline in test")),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("fallback: 3.7000")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("heading", { name: "Tlush" }));
    expect(await screen.findByText("live: 3.5000")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/** Every aria-controls in the page must name an element that is in the DOM. */
function expectControlsResolve() {
  const dangling = [...document.querySelectorAll("[aria-controls]")]
    .map((el) => el.getAttribute("aria-controls")!)
    .filter((id) => !document.getElementById(id));
  expect(dangling).toEqual([]);
}

describe("tabs", () => {
  it("links each tab to the panel it shows, with one tab stop", () => {
    render(<App />);
    expect(screen.getByRole("tablist")).toHaveAccessibleName();
    const [rsu, espp, explanation] = screen.getAllByRole("tab");
    expect(rsu).toHaveAttribute("aria-selected", "true");
    expect(rsu).toHaveAttribute("tabindex", "0");
    expect(espp).toHaveAttribute("tabindex", "-1");
    expect(explanation).toHaveAttribute("tabindex", "-1");
    const panel = screen.getByRole("tabpanel", { name: "RSU" });
    expect(rsu).toHaveAttribute("aria-controls", panel.id);
    expect(espp).not.toHaveAttribute("aria-controls");
    expect(explanation).not.toHaveAttribute("aria-controls");
    expect(panel).toHaveAttribute("tabindex", "0");
    expectControlsResolve();
  });

  it("moves focus and selection with arrows (wrapping), Home and End", async () => {
    const user = userEvent.setup();
    render(<App />);
    const tab = (name: string) => screen.getByRole("tab", { name });
    const expectActive = (name: string) => {
      expect(tab(name)).toHaveFocus();
      expect(tab(name)).toHaveAttribute("aria-selected", "true");
      expect(tab(name)).toHaveAttribute("aria-controls", screen.getByRole("tabpanel", { name }).id);
      expectControlsResolve();
    };

    tab("RSU").focus();
    await user.keyboard("{ArrowRight}");
    expectActive("ESPP");
    await user.keyboard("{ArrowRight}");
    expectActive("Explanation");
    await user.keyboard("{ArrowRight}");
    expectActive("RSU");
    await user.keyboard("{ArrowLeft}");
    expectActive("Explanation");
    await user.keyboard("{Home}");
    expectActive("RSU");
    await user.keyboard("{End}");
    expectActive("Explanation");
    await user.tab();
    expect(screen.getByRole("tabpanel", { name: "Explanation" })).toHaveFocus();
  });
});

describe("form labels", () => {
  function expectEveryControlNamed() {
    const controls = document.querySelectorAll("input, select");
    expect(controls.length).toBeGreaterThan(10);
    controls.forEach((el) => expect(el).toHaveAccessibleName());
  }

  it("names every control on both calculators, with fees and FX override open", async () => {
    const user = userEvent.setup();
    render(<App />);
    const fxOverride = screen.getByRole("checkbox", { name: "USD/ILS exchange rate" });
    await user.click(screen.getByText("USD/ILS exchange rate"));
    expect(fxOverride).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "USD/ILS exchange rate" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Customize sale fees/ }));
    await user.click(screen.getByRole("checkbox", { name: "Set stock price" }));
    expectEveryControlNamed();

    await user.click(screen.getByRole("tab", { name: "ESPP" }));
    await user.click(screen.getByRole("button", { name: /Customize sale fees/ }));
    await user.click(screen.getByRole("checkbox", { name: "Set stock price" }));
    expectEveryControlNamed();
  });
});

describe("help tooltips", () => {
  const salaryHelp = /Gross monthly average/;

  it("keeps help text out of the control's name and in its description", () => {
    render(<App />);
    const salary = screen.getByRole("spinbutton", { name: "Average monthly salary (₪)" });
    expect(salary).toHaveAccessibleDescription(salaryHelp);
    expect(screen.getByRole("combobox", { name: "Tax year" })).toHaveAccessibleDescription(
      /Which year's brackets/,
    );
    expect(screen.getByRole("checkbox", { name: "Set stock price" })).toHaveAccessibleDescription(
      /live market price is used/,
    );
  });

  it("opens on tap and closes on a second tap, Escape, or an outside press", async () => {
    const style = document.createElement("style");
    style.textContent = stylesheet;
    document.head.appendChild(style);
    const user = userEvent.setup();
    render(<App />);
    const tip = screen.getByText(salaryHelp);
    expect(tip).toHaveAttribute("role", "tooltip");
    const trigger = screen
      .getAllByRole("button", { name: "More info" })
      .find((b) => b.getAttribute("aria-describedby") === tip.id)!;
    expect(trigger).toHaveAccessibleDescription(salaryHelp);
    expect(tip).not.toBeVisible();

    await user.click(trigger);
    expect(tip).toBeVisible();
    await user.click(trigger);
    expect(tip).not.toBeVisible();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(tip).not.toBeVisible();

    await user.click(trigger);
    await user.click(screen.getByRole("heading", { name: "Tlush" }));
    expect(tip).not.toBeVisible();
  });
});

describe("result rows", () => {
  async function rsuWithPrice() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("checkbox", { name: /set stock price/i }));
    await user.type(screen.getByLabelText("Stock price (USD)"), "200");
    await screen.findByText("Total net");
    return user;
  }

  it("gives each row label its own element, free of tooltip text", async () => {
    const user = await rsuWithPrice();
    const exactly = (text: string) =>
      [...document.body.querySelectorAll("*")].filter(
        (el) => el.textContent!.replace(/\s+/g, " ").trim() === text,
      );
    for (const label of ["Average tax deduction", "Marginal tax", "Total net", "Monthly miluim pay (gross)"]) {
      expect(exactly(label), label).toHaveLength(1);
    }

    await user.click(screen.getByRole("tab", { name: "ESPP" }));
    await user.click(screen.getByRole("checkbox", { name: /set stock price/i }));
    await user.type(screen.getByLabelText("Stock price (USD)"), "80");
    await screen.findByText("Gross investment");
    for (const label of ["Gross investment", "Capital tax"]) {
      expect(exactly(label), label).toHaveLength(1);
    }
    await user.click(screen.getByRole("checkbox", { name: /With Trustee/i }));
    expect(exactly("Tax on discount (paid)")).toHaveLength(1);
  });

  it("does not expose plain rows as buttons", async () => {
    await rsuWithPrice();
    expect(screen.queryByRole("button", { name: /Total net/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Average tax deduction/ })).toBeNull();
  });

  it("expands a detail row through a button that controls the revealed region", async () => {
    const user = await rsuWithPrice();
    const gross = screen.getByRole("button", { name: "Gross" });
    expect(gross).toHaveAttribute("aria-expanded", "false");
    expect(gross).not.toHaveAttribute("aria-controls");
    expect(screen.queryByText("Foreign fee")).toBeNull();
    expectControlsResolve();

    await user.click(gross);
    expect(gross).toHaveAttribute("aria-expanded", "true");
    const detail = document.getElementById(gross.getAttribute("aria-controls")!);
    expect(detail).toContainElement(screen.getByText("Foreign fee"));
    expectControlsResolve();

    await user.keyboard("{Enter}");
    expect(gross).toHaveAttribute("aria-expanded", "false");
    expect(gross).not.toHaveAttribute("aria-controls");
    expect(screen.queryByText("Foreign fee")).toBeNull();
    expectControlsResolve();
  });
});

describe("ESPP calculator UI", () => {
  it("computes gross investment exactly from the defaults", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "ESPP" }));
    await user.click(screen.getByRole("checkbox", { name: /set stock price/i }));
    const price = screen.getByLabelText("Stock price (USD)");
    await user.clear(price);
    await user.type(price, "80");

    // Gross investment = discounted 42.5 × 100 shares × 3.7 = ₪15,725.00
    await waitFor(() =>
      expect(screen.getByText("₪15,725.00")).toBeInTheDocument(),
    );
    expect(screen.getByText("Gross investment")).toBeInTheDocument();
    expect(screen.getByText("Capital tax")).toBeInTheDocument();
    expect(screen.getByText(/Net gain|Net loss/)).toBeInTheDocument();
  });

  it("switches result rows when the trustee toggle is off", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "ESPP" }));
    await user.click(screen.getByRole("checkbox", { name: /set stock price/i }));
    const price = screen.getByLabelText("Stock price (USD)");
    await user.clear(price);
    await user.type(price, "80");
    await user.click(screen.getByRole("checkbox", { name: /With Trustee/i }));

    await waitFor(() =>
      expect(screen.getByText(/Tax on discount/i)).toBeInTheDocument(),
    );
  });
});
