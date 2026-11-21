// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";

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

describe("result rows", () => {
  async function rsuWithPrice() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("checkbox", { name: /set stock price/i }));
    await user.type(screen.getByLabelText("Stock price (USD)"), "200");
    await screen.findByText("Total net");
    return user;
  }

  it("does not expose plain rows as buttons", async () => {
    await rsuWithPrice();
    expect(screen.queryByRole("button", { name: /Total net/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Average tax deduction/ })).toBeNull();
  });

  it("expands a detail row through a button that controls the revealed region", async () => {
    const user = await rsuWithPrice();
    const gross = screen.getByRole("button", { name: "Gross" });
    expect(gross).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Foreign fee")).toBeNull();

    await user.click(gross);
    expect(gross).toHaveAttribute("aria-expanded", "true");
    const detail = document.getElementById(gross.getAttribute("aria-controls")!);
    expect(detail).toContainElement(screen.getByText("Foreign fee"));

    await user.keyboard("{Enter}");
    expect(gross).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Foreign fee")).toBeNull();
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
