// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Quote } from "../lib/market/quote";

// Market lookups are mocked per symbol with promises the test settles, so a
// failure (null), a success, and their order are all under the test's control.
const pending = {
  quote: new Map<string, (q: Quote | null) => void>(),
  grant: new Map<string, (p: number | null) => void>(),
};
vi.mock("../lib/market/quote", () => ({
  fetchQuote: vi.fn((symbol: string) => new Promise((r) => pending.quote.set(symbol, r))),
  fetchGrantPrice: vi.fn((symbol: string) => new Promise((r) => pending.grant.set(symbol, r))),
}));
const { App } = await import("../App");

async function settle<T>(map: Map<string, (v: T) => void>, symbol: string, value: T) {
  await waitFor(() => expect(map.has(symbol), `a lookup for ${symbol} was sent`).toBe(true));
  await act(async () => map.get(symbol)!(value));
}

const wix = (price: number): Quote => ({ symbol: "WIX", price, currency: "USD", isTase: false });

beforeEach(() => {
  pending.quote.clear();
  pending.grant.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline in test"))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const setPrice = () => screen.getByRole("checkbox", { name: /set stock price/i });
const grantPrice = () => screen.getByLabelText(/^Grant price \(USD\)/);
const results = () => screen.getByRole("region", { name: "Results" });

describe("RSU: live price fetch fails", () => {
  it("says so, opens the manual price field, and leaves focus in the symbol", async () => {
    const user = userEvent.setup();
    render(<App />);
    const symbol = screen.getByLabelText("Stock symbol");
    await user.type(symbol, "WIX");
    await settle(pending.quote, "WIX", null);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't fetch the live price for WIX. Enter it below.",
    );
    expect(setPrice()).toBeChecked();
    expect(screen.getByLabelText("Stock price (USD)")).toBeInTheDocument();
    expect(symbol).toHaveFocus();
  });

  it("lets the user turn the manual price back off", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "WIX");
    await settle(pending.quote, "WIX", null);
    await waitFor(() => expect(setPrice()).toBeChecked());

    await user.click(setPrice());
    await new Promise((r) => setTimeout(r, 400));
    expect(setPrice()).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(/Couldn't fetch the live price for WIX/);
  });

  it("ignores a late failure for a symbol the user has moved past", async () => {
    const user = userEvent.setup();
    render(<App />);
    const symbol = screen.getByLabelText("Stock symbol");
    await user.type(symbol, "WI");
    await waitFor(() => expect(pending.quote.has("WI")).toBe(true));
    await user.type(symbol, "X");
    await settle(pending.quote, "WIX", wix(50));
    await settle(pending.quote, "WI", null);

    expect(setPrice()).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Live price: $50.00");
  });
});

describe("RSU: grant price is never copied from the stock price", () => {
  it("withholds the result until a grant price is entered when there is no symbol", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(setPrice());
    await user.type(screen.getByLabelText("Stock price (USD)"), "150");

    expect(within(results()).queryByText("Grant price")).toBeNull();
    expect(within(results()).queryByText("Net to bank")).toBeNull();
    expect(results()).toHaveTextContent(/grant price/i);
    expect(grantPrice()).toHaveAccessibleDescription(/Enter the 30-day average before the grant date/);
    expect(grantPrice()).toHaveAttribute("aria-invalid", "true");

    await user.type(grantPrice(), "100");
    const row = within(results()).getByText("Grant price").closest(".result-head")!;
    expect(row).toHaveTextContent("$100.00");
    expect(grantPrice()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("says the grant-date price couldn't be fetched when the history lookup fails", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "WIX");
    await settle(pending.quote, "WIX", wix(150));
    await settle(pending.grant, "WIX", null);

    expect(grantPrice()).toHaveAccessibleDescription(
      /Couldn't fetch the grant-date price\. Enter the 30-day average before the grant date\./,
    );
    expect(within(results()).queryByText("Net to bank")).toBeNull();
    expect(within(results()).queryByText("$150.00")).toBeNull();

    await user.type(grantPrice(), "40");
    const row = within(results()).getByText("Grant price").closest(".result-head")!;
    expect(row).toHaveTextContent("$40.00");
  });

  it("uses the fetched grant-date price when the history lookup succeeds", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "WIX");
    await settle(pending.quote, "WIX", wix(150));
    await settle(pending.grant, "WIX", 90);

    const row = within(results()).getByText("Grant price").closest(".result-head")!;
    expect(row).toHaveTextContent("$90.00");
    expect(grantPrice()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("withholds the combined total and the phone summary while a grant lacks a grant price", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(setPrice());
    await user.type(screen.getByLabelText("Stock price (USD)"), "150");
    await user.type(grantPrice(), "100");
    await user.click(screen.getByRole("button", { name: /add another grant/i }));

    // The input card comes before the results column's slot of the same name.
    const second = screen.getAllByRole("heading", { name: "RSU grant 2" })[0].closest("section")!;
    await user.click(within(second).getByRole("checkbox", { name: /set stock price/i }));
    await user.type(within(second).getByLabelText("Stock price (USD)"), "150");

    const combined = () =>
      within(results()).getByRole("heading", { name: "Combined total" }).closest("section")!;
    expect(within(combined()).queryByText("Net to bank")).toBeNull();
    expect(combined()).toHaveTextContent("Grant 2 needs a grant price.");
    expect(screen.queryByRole("link", { name: /see breakdown/i })).toBeNull();

    await user.type(within(second).getByLabelText(/^Grant price \(USD\)/), "100");
    expect(within(combined()).getByText("Net to bank")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see breakdown/i })).toBeInTheDocument();
  });
});

describe("ESPP: live price fetch fails", () => {
  it("says so and opens the manual price field without moving focus", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "ESPP" }));
    const symbol = screen.getByLabelText("Stock symbol");
    await user.type(symbol, "WIX");
    await settle(pending.quote, "WIX", null);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't fetch the live price for WIX. Enter it below.",
    );
    expect(setPrice()).toBeChecked();
    expect(symbol).toHaveFocus();
  });
});
