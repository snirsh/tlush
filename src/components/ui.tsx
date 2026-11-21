import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import type { Tone } from "../lib/format";

/**
 * Inline help marker. Hover and keyboard focus show the tip (CSS); a click or
 * tap toggles it, and Escape, blur or an outside press closes it. `id` names
 * the tooltip so the control it explains can point aria-describedby at it.
 */
export function Info({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="info-wrap"
      data-open={open || undefined}
      data-dismissed={dismissed || undefined}
      onPointerEnter={() => setDismissed(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="info"
        aria-label="More info"
        aria-describedby={id}
        onFocus={() => setDismissed(false)}
        onBlur={() => setOpen(false)}
        onClick={() => {
          setDismissed(open);
          setOpen(!open);
        }}
      >
        ?
      </button>
      <span role="tooltip" id={id} className="info-tip">
        {text}
      </span>
    </span>
  );
}

/** Ties the control inside a Field to its label and help text. */
const FieldContext = createContext<{ id: string; describedBy?: string } | null>(null);

export function useFieldControl():{ id?: string; "aria-describedby"?: string } {
  const field = useContext(FieldContext);
  return field ? { id: field.id, "aria-describedby": field.describedBy } : {};
}

/** A labelled form row with optional help text. */
export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  const id = useId();
  const tipId = useId();
  return (
    <div className="field">
      <span className="field-label">
        <label htmlFor={id}>{label}</label>
        {help ? <Info id={tipId} text={help} /> : null}
      </span>
      <FieldContext.Provider value={{ id, describedBy: help ? tipId : undefined }}>
        {children}
      </FieldContext.Provider>
    </div>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const control = useFieldControl();
  return <select {...control} {...props} />;
}

export function DateInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const control = useFieldControl();
  return <input type="date" {...control} {...props} />;
}

/** A labelled checkbox toggle. */
export function Toggle({
  label,
  hideLabel,
  help,
  checked,
  onChange,
}: {
  label: string;
  /** Keep the label for assistive tech only, when the context already shows it. */
  hideLabel?: boolean;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  const tipId = useId();
  const field = useContext(FieldContext);
  return (
    <div className="toggle">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={help ? tipId : field?.describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-label">
        <label htmlFor={id}>
          {hideLabel ? <span className="visually-hidden">{label}</span> : label}
        </label>
        {help ? <Info id={tipId} text={help} /> : null}
      </span>
    </div>
  );
}

/** A number input that keeps an empty string editable and reports a number. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  const control = useFieldControl();
  return (
    <input
      {...control}
      type="number"
      inputMode="decimal"
      value={value}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) =>
        onChange(e.target.value === "" ? "" : Number(e.target.value))
      }
    />
  );
}

/** A result row: label (with help) on the left, value on the right. */
export function ResultRow({
  label,
  help,
  value,
  emphasis,
  tone,
  children,
}: {
  label: string;
  help?: string;
  value: ReactNode;
  /** Render as a bottom-line total (heavy rule, larger figure). */
  emphasis?: boolean;
  /** Tint the figure to match the breakdown key (sign tone or a category). */
  tone?: Tone;
  /** Expandable detail revealed on click. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const tipId = useId();
  const expandable = Boolean(children);
  return (
    <div className={`result-row${expandable ? " expandable" : ""}${emphasis ? " emph" : ""}`}>
      {/* The head owns the click so the whole row stays a mouse target; the
          button inside is the keyboard and screen-reader control. */}
      <div className="result-head" onClick={expandable ? () => setOpen((o) => !o) : undefined}>
        <span className="result-label">
          {expandable ? (
            <button
              type="button"
              className="result-toggle"
              aria-expanded={open}
              aria-controls={detailId}
              aria-describedby={help ? tipId : undefined}
            >
              <span className="caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
              {label}
            </button>
          ) : (
            label
          )}
          {help ? <Info id={tipId} text={help} /> : null}
        </span>
        <span className={`result-value${tone ? ` ${tone}` : ""}`}>{value}</span>
      </div>
      {expandable && open ? (
        <div className="result-detail" id={detailId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Debounced effect helper. */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current);
  }, [value, delay]);
  return debounced;
}

/** Right-column placeholder shown until the inputs produce a result. */
export function EmptyResults() {
  return (
    <div className="results-empty">
      <p>Enter a stock price — or a symbol — and your after-tax breakdown appears here.</p>
    </div>
  );
}

/** True when the user asked the OS to minimise motion. Safe in non-browser envs. */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduce;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A figure that rolls from its previous value to the next one whenever it
 * changes (and counts up from zero on first appearance). Falls back to the
 * final value instantly when motion is reduced or rAF is unavailable (SSR/jsdom),
 * so the exact formatted number is always reachable for tests and a11y.
 */
export function AnimatedValue({
  value,
  format,
  duration = 650,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const canAnimate = !reduce && typeof requestAnimationFrame === "function";
    if (!canAnimate) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      const current = from + (to - from) * easeOutCubic(t);
      fromRef.current = current;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, reduce]);

  const shown = format(display);
  const final = format(value);
  if (shown === final) return <span className="num">{final}</span>;
  // Mid-roll: screen readers get only the destination, never the ticking digits.
  return (
    <span className="num">
      <span aria-hidden="true">{shown}</span>
      <span className="visually-hidden">{final}</span>
    </span>
  );
}
