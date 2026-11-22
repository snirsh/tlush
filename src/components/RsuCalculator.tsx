import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  combineRsuGrants,
  computeRsuGrant,
  monthlyMaternityPay,
  monthlyMiluimPay,
  type RsuGrantResult,
  type TaxProfile,
} from "../lib/tax";
import { fetchGrantPrice, fetchQuote, isTaseSymbol, type Quote } from "../lib/market/quote";
import { ils, money, num, pct, signTone, todayIso } from "../lib/format";
import type { Settings } from "./GlobalInputs";
import { SymbolInput } from "./SymbolInput";
import {
  EMPTY_FEES,
  FeeEditor,
  resolveFees,
  type FeeOverrides,
} from "./FeeEditor";
import { AnimatedValue, DateInput, EmptyResults, Field, NumberInput, ResultRow, Toggle } from "./ui";
import { BreakdownBar } from "./Breakdown";
import { RESULTS_ID, ResultsJump } from "./ResultsJump";
import { IDLE, liveQuote, lookupFor, NO_PRICE_YET, quoteStatus, useLookup, type Lookup } from "./lookup";

interface Grant {
  id: string;
  symbol: string;
  shares: number | "";
  grantDate: string;
  setPrice: boolean;
  priceOverride: number | "";
  grantPriceOverride: number | "";
  changedWorkplace: boolean;
  previousSalary: number | "";
  whatIf2Years: boolean;
  fees: FeeOverrides;
  quote: Lookup<Quote>;
  /** The 30-day average before the grant date, from price history. */
  history: Lookup<number>;
}

function newGrant(): Grant {
  return {
    id: crypto.randomUUID(),
    symbol: "",
    shares: 100,
    grantDate: "2023-01-01",
    setPrice: false,
    priceOverride: "",
    grantPriceOverride: "",
    changedWorkplace: false,
    previousSalary: "",
    whatIf2Years: false,
    fees: { ...EMPTY_FEES },
    quote: IDLE,
    history: IDLE,
  };
}

const isTase = (g: Grant) => isTaseSymbol(g.symbol.trim());
const quoteOf = (g: Grant) => lookupFor(g.quote, g.symbol.trim());
const historyOf = (g: Grant) => lookupFor(g.history, historyKey(g));

/** The grant price the split rests on: entered, or fetched. Never the stock price. */
function grantPriceOf(g: Grant): number | null {
  if (g.grantPriceOverride !== "") return Number(g.grantPriceOverride);
  const history = historyOf(g);
  return history.status === "ok" ? history.value : null;
}

/** A grant's result, or the first input it still needs. */
type Outcome =
  | { kind: "ok"; result: RsuGrantResult; price: number; grantPrice: number }
  | { kind: "needs"; input: "stock price" | "share count" | "grant price" };

const historyKey = (g: Grant) => (g.symbol.trim() && g.grantDate ? `${g.symbol.trim()}|${g.grantDate}` : "");
const fetchHistory = (key: string) => {
  const [symbol, date] = key.split("|");
  return fetchGrantPrice(symbol, new Date(date));
};

const MAX_GRANTS = 8;

export function RsuCalculator({
  settings,
  fx,
  grants,
  setGrants,
  globalInputs,
}: {
  settings: Settings;
  fx: number;
  grants: Grant[];
  setGrants: Dispatch<SetStateAction<Grant[]>>;
  globalInputs: ReactNode;
}) {
  const update = (id: string, patch: Partial<Grant>) =>
    setGrants((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const profile: TaxProfile = {
    monthlySalary: settings.noIncomeYear ? 0 : Number(settings.monthlySalary) || 0,
    year: settings.year,
    extraCapitalGain: Number(settings.extraCapitalGain) || 0,
    noIncomeYear: settings.noIncomeYear,
  };

  const allTase = grants.length > 0 && grants.every(isTase);
  const showInUsd = settings.saleInDollars && !allTase;

  const outcomes = useMemo(
    () =>
      grants.map((g): Outcome => {
        const price = g.setPrice ? Number(g.priceOverride) : liveQuote(quoteOf(g))?.price ?? 0;
        const grantPrice = grantPriceOf(g);
        const shares = Number(g.shares) || 0;
        if (price <= 0) return { kind: "needs", input: "stock price" };
        if (shares <= 0) return { kind: "needs", input: "share count" };
        if (grantPrice === null) return { kind: "needs", input: "grant price" };
        const workplaceSalary =
          g.changedWorkplace || settings.noIncomeYear
            ? Number(g.previousSalary) || 0
            : Number(settings.monthlySalary) || 0;
        const res = computeRsuGrant(
          {
            shares,
            stockPrice: price,
            grantPrice,
            grantDate: new Date(g.grantDate),
            fxRate: fx,
            isTase: isTase(g),
            whatIf2Years: g.whatIf2Years,
            workplaceMonthlySalary: workplaceSalary,
            fees: resolveFees(g.fees),
          },
          profile,
        );
        return { kind: "ok", result: { ...res, isRefund: g.changedWorkplace }, price, grantPrice };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grants, settings, fx],
  );

  const valid = outcomes.flatMap((o) => (o.kind === "ok" ? [o.result] : []));
  // A total that silently skips a grant is not the total: wait for all of them.
  const complete = valid.length === grants.length;
  const combined = complete ? combineRsuGrants(valid, profile) : null;
  const incomePortion = valid.reduce((a, r) => a + r.incomePortion, 0);
  const anyRefund = grants.some((g) => g.changedWorkplace);
  const multi = grants.length > 1;
  // The bottom line the panels show: one grant's own, or the combined total.
  const bankIls = multi ? combined?.netToBank : valid[0]?.netToBank;
  const pastStockPrice = outcomes.some((o) => o.kind === "ok" || o.input !== "stock price");

  return (
    <div className="layout">
      {bankIls !== undefined ? (
        <ResultsJump
          label={multi ? "Net to bank, all grants" : "Net to bank"}
          value={showInUsd ? money(bankIls / fx, "USD") : ils(bankIls)}
        />
      ) : null}
      <div className="inputs-col">
        {globalInputs}
        {grants.map((g, i) => (
          <GrantCard
            key={g.id}
            index={i}
            grant={g}
            needsGrantPrice={outcomes[i].kind === "needs" && outcomes[i].input === "grant price"}
            onChange={(patch) => update(g.id, patch)}
            onRemove={
              grants.length > 1 ? () => setGrants(grants.filter((x) => x.id !== g.id)) : undefined
            }
          />
        ))}

        {grants.length < MAX_GRANTS ? (
          <button
            type="button"
            className="add-grant"
            onClick={() => setGrants([...grants, newGrant()])}
          >
            + Add another grant
          </button>
        ) : null}
      </div>

      <section className="results-col" id={RESULTS_ID} aria-label="Results" tabIndex={-1}>
        {!pastStockPrice ? (
          <EmptyResults>{grants.some((g) => quoteOf(g).status === "failed") ? NO_PRICE_YET : undefined}</EmptyResults>
        ) : !multi && outcomes[0].kind === "needs" ? (
          <EmptyResults>{`Enter the ${outcomes[0].input} and your after-tax breakdown appears here.`}</EmptyResults>
        ) : (
          <>
            {grants.map((g, i) => {
              const o = outcomes[i];
              return (
                <section className="panel results-panel" key={g.id}>
                  {multi ? <h2>RSU grant {i + 1}</h2> : null}
                  {o.kind === "ok" ? (
                    <GrantResults outcome={o} grant={g} fx={fx} showInUsd={showInUsd} />
                  ) : (
                    <p className="muted">Enter this grant's {o.input} to see its breakdown.</p>
                  )}
                </section>
              );
            })}

            {multi && !combined ? (
              <section className="panel results-panel">
                <h2>Combined total</h2>
                <p className="muted">
                  {[
                    "Appears once every grant is complete.",
                    ...outcomes.flatMap((o, i) => (o.kind === "needs" ? [`Grant ${i + 1} needs a ${o.input}.`] : [])),
                  ].join(" ")}
                </p>
              </section>
            ) : null}

            {combined && grants.length === 1 ? (
              <section className="panel results-panel">
                <SellingTips incomePortion={incomePortion} settings={settings} />
              </section>
            ) : null}

            {combined && grants.length > 1 ? (
              <section className="panel results-panel">
                <h2>Combined total</h2>
                <BreakdownBar
            segments={[
              { label: "Net", value: combined.totalNet, tone: "net" },
              { label: "Income", value: combined.marginalTax, tone: "income" },
              { label: "Bituah", value: combined.bituah, tone: "bituah" },
              { label: "Capital", value: combined.capitalTax, tone: "capital" },
              { label: "Fees", value: combined.gross - combined.totalNet - combined.marginalTax - combined.bituah - combined.capitalTax, tone: "fees" },
            ]}
          />
          <ResultRow label="Gross" value={<AnimatedValue value={combined.gross} format={ils} />} />
          <ResultRow
            label="Average tax deduction"
            help="Total tax ÷ gross across all grants."
            value={<AnimatedValue value={combined.averageTaxRate} format={pct} />}
          />
          <ResultRow label="Marginal tax" value={<AnimatedValue value={combined.marginalTax} format={ils} />} tone="income" />
          <ResultRow label="Bituah Leumi & health" value={<AnimatedValue value={combined.bituah} format={ils} />} tone="bituah" />
          <ResultRow label="Capital tax" value={<AnimatedValue value={combined.capitalTax} format={ils} />} tone="capital" />
          <ResultRow label="Total net" value={<AnimatedValue value={combined.totalNet} format={ils} />} tone="net" />
          <ResultRow
            label="Net to bank"
            value={<AnimatedValue value={combined.netToBank / (showInUsd ? fx : 1)} format={(n) => money(n, showInUsd ? "USD" : "ILS")} />}
            emphasis
          />
          <ResultRow
            label={anyRefund ? "Net tax refund" : "Net to salary"}
            value={<AnimatedValue value={combined.netToSalary} format={ils} />}
            tone={signTone(combined.netToSalary)}
          />
          <ResultRow
            label={combined.surtax < 0 ? "Magen Mas" : "Surtax owed"}
            help="Additional 3%/5% surtax based on annual income; negative means a loss available against future tax."
            value={<AnimatedValue value={Math.abs(combined.surtax)} format={ils} />}
            tone={combined.surtax > 0 ? "neg" : combined.surtax < 0 ? "pos" : undefined}
          />
          <SellingTips incomePortion={incomePortion} settings={settings} />
              </section>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

/** What the grant-price field says under itself, unless the user has typed one. */
function grantPriceNote(g: Grant, cur: "ILS" | "USD"): string | undefined {
  if (g.grantPriceOverride !== "") return undefined;
  const history = historyOf(g);
  switch (history.status) {
    case "ok":
      return `Fetched from price history: ${money(history.value, cur)}. Type to override it.`;
    case "loading":
      return "Fetching the grant-date price…";
    case "failed":
      return "Couldn't fetch the grant-date price. Enter the 30-day average before the grant date.";
    case "idle":
      return "Enter the 30-day average before the grant date.";
  }
}

function GrantCard({
  index,
  grant,
  needsGrantPrice,
  onChange,
  onRemove,
}: {
  index: number;
  grant: Grant;
  /** The missing grant price is the only thing between this grant and a result. */
  needsGrantPrice: boolean;
  onChange: (patch: Partial<Grant>) => void;
  onRemove?: () => void;
}) {
  // A failed lookup turns the manual price on; turning it back off sticks.
  useLookup(grant.symbol.trim(), fetchQuote, (quote) =>
    onChange(quote.status === "failed" ? { quote, setPrice: true } : { quote }),
  );
  useLookup(historyKey(grant), fetchHistory, (history) => onChange({ history }));

  const cur = isTase(grant) ? "ILS" : "USD";
  const history = historyOf(grant);

  return (
    <section className="panel grant">
      <div className="grant-head">
        <h2>RSU grant {index + 1}</h2>
        {onRemove ? (
          <button type="button" className="remove" onClick={onRemove} aria-label="Remove grant">
            ✕
          </button>
        ) : null}
      </div>

      <div className="grid">
        <Field label="Stock symbol" help="NASDAQ/NYSE ticker. For Tel Aviv listings add .TA (e.g. POLI.TA).">
          <SymbolInput
            value={grant.symbol}
            onChange={(v) => onChange({ symbol: v })}
            onPick={(v) => onChange({ symbol: v })}
          />
        </Field>
        <Field label="Number of shares" help="How many shares from this grant you intend to sell (at least 1).">
          <NumberInput value={grant.shares} onChange={(v) => onChange({ shares: v })} min={1} step={1} />
        </Field>
        <Field label="Grant date" help="The date your shares were granted (not the vesting date).">
          <DateInput value={grant.grantDate} max={todayIso()} onChange={(e) => onChange({ grantDate: e.target.value })} />
        </Field>
      </div>

      <Toggle
        label="Set stock price"
        help="Off: live market price is used. On: override with your own number for what-if scenarios."
        checked={grant.setPrice}
        onChange={(v) => onChange({ setPrice: v })}
      />
      <p className="muted" role="status">
        {quoteStatus(quoteOf(grant), grant.setPrice)}
      </p>
      {grant.setPrice ? (
        <Field label={`Stock price (${cur})`}>
          <NumberInput value={grant.priceOverride} onChange={(v) => onChange({ priceOverride: v })} min={0} step={0.0001} />
        </Field>
      ) : null}

      <Field
        label={`Grant price (${cur})`}
        help="Average price over the 30 working days before the grant date. Filled from price history when it can be fetched."
        note={grantPriceNote(grant, cur)}
        invalid={needsGrantPrice}
      >
        <NumberInput
          value={grant.grantPriceOverride}
          onChange={(v) => onChange({ grantPriceOverride: v })}
          min={0}
          step={0.0001}
          placeholder={history.status === "ok" ? num(history.value, 4) : undefined}
        />
      </Field>

      <Toggle
        label="Changed workplace"
        help="Tick if you left the workplace that issued this grant. Used to compute Bituah Leumi from the salary you had there."
        checked={grant.changedWorkplace}
        onChange={(v) => onChange({ changedWorkplace: v })}
      />
      {grant.changedWorkplace ? (
        <Field label="Previous salary (₪)" help="The gross monthly salary you earned at the grant workplace.">
          <NumberInput value={grant.previousSalary} onChange={(v) => onChange({ previousSalary: v })} min={0} step={500} />
        </Field>
      ) : null}

      <Toggle
        label="What if 2 years pass?"
        help="Apply the 2-year capital-gains rule even if 2 years haven't passed since the grant date."
        checked={grant.whatIf2Years}
        onChange={(v) => onChange({ whatIf2Years: v })}
      />

      <FeeEditor value={grant.fees} onChange={(fees) => onChange({ fees })} />
    </section>
  );
}

function GrantResults({
  outcome: { result, price: effPrice, grantPrice },
  grant,
  fx,
  showInUsd,
}: {
  outcome: Extract<Outcome, { kind: "ok" }>;
  grant: Grant;
  fx: number;
  showInUsd: boolean;
}) {
  const cur = isTase(grant) ? "ILS" : "USD";
  const bankCur = showInUsd ? "USD" : "ILS";
  const bankVal = showInUsd ? result.netToBank / fx : result.netToBank;

  const feesShare =
    result.gross - result.totalNet - result.marginalTax - result.bituah - result.capitalTax;

  return (
    <div className="results">
      <h3>Results</h3>
      <BreakdownBar
        segments={[
          { label: "Net", value: result.totalNet, tone: "net" },
          { label: "Income", value: result.marginalTax, tone: "income" },
          { label: "Bituah", value: result.bituah, tone: "bituah" },
          { label: "Capital", value: result.capitalTax, tone: "capital" },
          { label: "Fees", value: feesShare, tone: "fees" },
        ]}
      />
      {!isTase(grant) ? <ResultRow label="USD → ILS" value={`1$ = ${num(fx, 4)}₪`} /> : null}
      <ResultRow label="Stock price" value={<AnimatedValue value={effPrice} format={(n) => money(n, cur)} />} />
      <ResultRow label="Grant price" help="30-working-day average before the grant date — the income/capital split basis." value={<AnimatedValue value={grantPrice} format={(n) => money(n, cur)} />} />
      <ResultRow label="Gross" help="Sale value before tax: price × shares × fx." value={<AnimatedValue value={result.gross} format={ils} />}>
        <ResultRow label="Foreign fee" value={<AnimatedValue value={result.fees.foreign} format={ils} />} />
        <ResultRow label="Service fee" value={<AnimatedValue value={result.fees.service} format={ils} />} />
        <ResultRow label="After-fee gross" value={<AnimatedValue value={result.fees.afterFeeGross} format={ils} />} />
      </ResultRow>
      <ResultRow label="Average tax deduction" help="Total tax ÷ gross." value={<AnimatedValue value={result.averageTaxRate} format={pct} />} />
      <ResultRow label="Marginal tax" help="Income tax on the revenue portion at your bracket." value={<AnimatedValue value={result.marginalTax} format={ils} />} tone="income" />
      <ResultRow label="Bituah Leumi & health" help="National insurance + health on the income portion, up to the ceiling." value={<AnimatedValue value={result.bituah} format={ils} />} tone="bituah" />
      <ResultRow label="Capital tax" help="Capital-gains tax on the capital portion (if 2 years passed)." value={<AnimatedValue value={result.capitalTax} format={ils} />} tone="capital" />
      <ResultRow label="Total net" help="Gross − fees − taxes." value={<AnimatedValue value={result.totalNet} format={ils} />} tone="net" />
      <ResultRow label="Net to bank" help="Amount that hits your bank on the sale day." value={<AnimatedValue value={bankVal} format={(n) => money(n, bankCur)} />} emphasis>
        <ResultRow label="Wire fee" value={<AnimatedValue value={showInUsd ? result.fees.wire / fx : result.fees.wire} format={(n) => money(n, bankCur)} />} />
      </ResultRow>
      <ResultRow
        label={result.isRefund ? "Net tax refund" : "Net to salary"}
        help="Income-tax difference returned via salary, or claimable as a refund if you left the employer."
        value={<AnimatedValue value={result.netToSalary} format={ils} />}
        tone={signTone(result.netToSalary)}
      />
      {result.breakEvenPrice2y !== null ? (
        <ResultRow
          label="2 years break-even stock price"
          help="The future price where waiting to the 2-year mark yields the same net as selling now."
          value={<AnimatedValue value={result.breakEvenPrice2y} format={(n) => money(n, cur)} />}
        />
      ) : null}
    </div>
  );
}

function SellingTips({
  incomePortion,
  settings,
}: {
  incomePortion: number;
  settings: Settings;
}) {
  const salary = settings.noIncomeYear ? 0 : Number(settings.monthlySalary) || 0;
  const miluim = monthlyMiluimPay(salary, incomePortion, settings.year);
  const maternity = monthlyMaternityPay(salary, incomePortion, settings.year);
  return (
    <div className="tips">
      <h3>Selling tips</h3>
      <ResultRow label="Monthly miluim pay (gross)" help="Gross monthly reserve-duty pay. Bituah Leumi bases it on your income in the 3 months before the call-up, so a one-time sale lifts it by the income portion ÷ 3 (capped at the NI ceiling)." value={<AnimatedValue value={miluim} format={ils} />} />
      <ResultRow label="Monthly maternity pay (gross)" help="Gross monthly maternity pay; full 105-day entitlement is this × 3.5." value={<AnimatedValue value={maternity} format={ils} />} />
    </div>
  );
}

export { newGrant };
export type { Grant };
