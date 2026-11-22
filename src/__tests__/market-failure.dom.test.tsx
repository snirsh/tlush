// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Quote } from "../lib/market/quote";

// Market lookups are mocked with promises the test settles, so a failure
// (null), a success, and their order are all under the test's control. Quotes
// are keyed by symbol, grant-date history by "SYMBOL|yyyy-mm-dd".
const pending = {
  quote: new Map<string, (q: Quote | null) => void>(),
  grant: new Map<string, (p: number | null) => void>(),
};
vi.mock("../lib/market/quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/market/quote")>()),
  fetchQuote: vi.fn((symbol: string) => new Promise((r) => pending.quote.set(symbol, r))),
  fetchGrantPrice: vi.fn(
    (symbol: string, date: Date) =>
      new Promise((r) => pending.grant.set(`${symbol}|${date.toISOString().slice(0, 10)}`, r)),
  ),
}));
const { App } = await import("../App");
const { fetchQuote } = await import("../lib/market/quote");

async function settle<T>(map: Map<string, (v: T) => void>, symbol: string, value: T) {
  await waitFor(() => expect(map.has(symbol), `a lookup for ${symbol} was sent`).toBe(true));
  await act(async () => map.get(symbol)!(value));
}

const wix = (price: number): Quote => ({ symbol: "WIX", price, currency: "USD", isTase: false });
const DEFAULT_GRANT_DATE = "2023-01-01";

beforeEach(() => {
  vi.mocked(fetchQuote).mockClear();
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

  // The old reply lands after the symbol changed but before the new lookup is
  // even sent: the window where a stale answer could pass for the current one.
  it("never shows or computes with a price for a symbol the user has typed past", async () => {
    const user = userEvent.setup();
    render(<App />);
    const symbol = screen.getByLabelText("Stock symbol");
    await user.type(symbol, "WI");
    await waitFor(() => expect(pending.quote.has("WI")).toBe(true));
    await user.type(symbol, "X");
    await act(async () => pending.quote.get("WI")!(wix(99)));

    expect(pending.quote.has("WIX")).toBe(false);
    expect(screen.getByRole("status")).not.toHaveTextContent("$99.00");
    await user.click(setPrice());
    expect(screen.getByLabelText("Stock price (USD)")).toHaveValue(null);
    expect(results()).not.toHaveTextContent("$99.00");
    await user.click(setPrice());

    await settle(pending.quote, "WIX", wix(50));
    expect(screen.getByRole("status")).toHaveTextContent("Live price: $50.00");
  });

  it("ignores a failure for a symbol the user has typed past", async () => {
    const user = userEvent.setup();
    render(<App />);
    const symbol = screen.getByLabelText("Stock symbol");
    await user.type(symbol, "WI");
    await waitFor(() => expect(pending.quote.has("WI")).toBe(true));
    await user.type(symbol, "X");
    await act(async () => pending.quote.get("WI")!(null));

    expect(setPrice()).not.toBeChecked();
    expect(screen.getByRole("status")).not.toHaveTextContent("Couldn't fetch");
  });

  it("looks a symbol up once typing pauses, not on every keystroke", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "WIX");
    await waitFor(() => expect(pending.quote.has("WIX")).toBe(true));
    expect(vi.mocked(fetchQuote).mock.calls).toEqual([["WIX"]]);
  });

  it("drops the price and the result as soon as the symbol is cleared", async () => {
    const user = userEvent.setup();
    render(<App />);
    const symbol = screen.getByLabelText("Stock symbol");
    await user.type(symbol, "WIX");
    await settle(pending.quote, "WIX", wix(150));
    await settle(pending.grant, `WIX|${DEFAULT_GRANT_DATE}`, 90);
    expect(within(results()).getByText("Net to bank")).toBeInTheDocument();

    await user.clear(symbol);
    expect(within(results()).queryByText("Net to bank")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Enter a symbol, or turn on “Set stock price”.");
  });

  it("says to enter the stock price in the empty results once the lookup failed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "WIX");
    await settle(pending.quote, "WIX", null);
    expect(results()).toHaveTextContent("Enter the stock price and your after-tax breakdown appears here.");
  });
});

describe("RSU: Tel Aviv listings are priced in shekels", () => {
  it("labels and computes in ILS when the lookup fails for a .TA symbol", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "POLI.TA");
    await settle(pending.quote, "POLI.TA", null);
    await settle(pending.grant, `POLI.TA|${DEFAULT_GRANT_DATE}`, null);

    await user.type(screen.getByLabelText("Stock price (ILS)"), "10");
    await user.type(screen.getByLabelText(/^Grant price \(ILS\)/), "8");
    // Gross = 10 × 100 shares, with no USD conversion.
    expect(results()).toHaveTextContent("₪1,000.00");
    expect(within(results()).queryByText("USD → ILS")).toBeNull();
  });

  it("labels and computes in ILS when the lookup succeeds", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "POLI.TA");
    await settle(pending.quote, "POLI.TA", { symbol: "POLI.TA", price: 12, currency: "ILA", isTase: true });
    await settle(pending.grant, `POLI.TA|${DEFAULT_GRANT_DATE}`, 10);

    expect(screen.getByRole("status")).toHaveTextContent("Live price: ₪12.00");
    expect(screen.getByLabelText(/^Grant price \(ILS\)/)).toBeInTheDocument();
    // Gross = 12 × 100 shares, with no USD conversion.
    expect(results()).toHaveTextContent("₪1,200.00");
    expect(within(results()).queryByText("USD → ILS")).toBeNull();
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

  it("re-fetches the grant-date price for a new grant date and never shows the old one meanwhile", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "WIX");
    await settle(pending.quote, "WIX", wix(150));
    await settle(pending.grant, `WIX|${DEFAULT_GRANT_DATE}`, 90);
    const row = () => within(results()).queryByText("Grant price")?.closest(".result-head");
    expect(row()).toHaveTextContent("$90.00");

    fireEvent.change(screen.getByLabelText("Grant date"), { target: { value: "2024-01-15" } });
    expect(row() ?? null).toBeNull();
    expect(screen.queryByText(/\$90\.00/)).toBeNull();

    await settle(pending.grant, "WIX|2024-01-15", 70);
    expect(row()).toHaveTextContent("$70.00");
  });

  it("says the grant-date price couldn't be fetched when the history lookup fails", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Stock symbol"), "WIX");
    await settle(pending.quote, "WIX", wix(150));
    await settle(pending.grant, `WIX|${DEFAULT_GRANT_DATE}`, null);

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
    await settle(pending.grant, `WIX|${DEFAULT_GRANT_DATE}`, 90);

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
    expect(results()).toHaveTextContent("Enter the stock price and your after-tax breakdown appears here.");
  });

  it("labels and computes in ILS when the lookup fails for a .TA symbol", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "ESPP" }));
    await user.type(screen.getByLabelText("Stock symbol"), "POLI.TA");
    await settle(pending.quote, "POLI.TA", null);

    expect(screen.getByLabelText("Purchased price (ILS)")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Stock price (ILS)"), "80");
    // Gross = 80 × 100 shares, with no USD conversion.
    expect(results()).toHaveTextContent("₪8,000.00");
  });
});
