import { useEffect, useState, type KeyboardEvent } from "react";
import { DEFAULT_SETTINGS, GlobalInputs, type Settings } from "./components/GlobalInputs";
import { RsuCalculator, newGrant, type Grant } from "./components/RsuCalculator";
import { EsppCalculator, newEspp, type EsppState } from "./components/EsppCalculator";
import { Explanation } from "./components/Explanation";
import { FALLBACK_USD_ILS, fetchUsdIls } from "./lib/market/fx";
import { onFirstInteraction } from "./lib/firstInteraction";

const TABS = [
  { id: "rsu", label: "RSU" },
  { id: "espp", label: "ESPP" },
  { id: "explanation", label: "Explanation" },
] as const;

type Tab = (typeof TABS)[number]["id"];

/** WAI-ARIA tabs keys: arrows wrap, Home/End jump; focus follows selection. */
function tabIndexForKey(key: string, current: number): number | undefined {
  const last = TABS.length - 1;
  switch (key) {
    case "ArrowRight":
      return current === last ? 0 : current + 1;
    case "ArrowLeft":
      return current === 0 ? last : current - 1;
    case "Home":
      return 0;
    case "End":
      return last;
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>("rsu");

  const onTabKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const next = tabIndexForKey(e.key, TABS.findIndex((t) => t.id === tab));
    if (next === undefined) return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [fxLive, setFxLive] = useState(FALLBACK_USD_ILS);
  const [fxIsLive, setFxIsLive] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([newGrant()]);
  const [espp, setEspp] = useState<EsppState>(newEspp());

  useEffect(
    () =>
      onFirstInteraction(() =>
        fetchUsdIls().then(({ rate, live }) => {
          setFxLive(rate);
          setFxIsLive(live);
        }),
      ),
    [],
  );

  const fx =
    settings.fxOverride !== null && settings.fxOverride !== ""
      ? Number(settings.fxOverride)
      : fxLive;

  // Shared "General inputs" — rendered into the left input column of whichever
  // calculator tab is active, so all inputs live on one side on desktop.
  const globalInputs = (
    <GlobalInputs settings={settings} onChange={setSettings} fxLive={fxLive} fxIsLive={fxIsLive} />
  );

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-text">
          <span className="eyebrow">Israeli RSU &amp; ESPP · Section 102 capital track</span>
          <h1>Tlush</h1>
          <p className="lede">
            See what actually reaches your bank. Your RSU or ESPP sale, run
            through every Israeli tax layer — income tax, Bituah Leumi, capital
            gains — entirely in your browser. Nothing leaves your device.
          </p>
        </div>
      </header>

      <main>
        <nav className="tabs" role="tablist" aria-label="Calculator" onKeyDown={onTabKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-controls={tab === t.id ? `panel-${t.id}` : undefined}
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === "rsu" ? (
            <RsuCalculator
              settings={settings}
              fx={fx}
              grants={grants}
              setGrants={setGrants}
              globalInputs={globalInputs}
            />
          ) : null}
          {tab === "espp" ? (
            <EsppCalculator
              settings={settings}
              fx={fx}
              plan={espp}
              setPlan={setEspp}
              globalInputs={globalInputs}
            />
          ) : null}
          {tab === "explanation" ? <Explanation /> : null}
        </div>
      </main>

      <footer className="footer">
        <p>
          For educational use only — not legal, financial or tax advice. Tax
          rules change; verify figures with a licensed Israeli tax adviser before
          acting. Open-source and self-hostable.
        </p>
        <p className="footer-credit">
          made by{" "}
          <a
            href="https://snirsh.codes"
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby="new-tab-note"
          >
            <bdi>Snir Sharristh</bdi>
          </a>
        </p>
        <span id="new-tab-note" hidden>
          opens in a new tab
        </span>
      </footer>
    </div>
  );
}
