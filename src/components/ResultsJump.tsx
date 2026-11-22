import { useEffect, useState, type MouseEvent } from "react";
import { usePrefersReducedMotion } from "./ui";

/** Id of each calculator's results column: the jump target. One tab renders at a time. */
export const RESULTS_ID = "results";

/**
 * True while any part of the element with this id is on screen. Starts true,
 * and stays true when visibility cannot be determined (no element, or no
 * IntersectionObserver): the bar then stays hidden rather than risk covering
 * the very breakdown it points at.
 */
function useInView(id: string): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [id]);
  return inView;
}

const TEXT_ENTRY = "select, textarea, input:not([type=checkbox]):not([type=radio])";

function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false; // selector unsupported (older engines, jsdom)
  }
}

/**
 * True while the user is working in a field the bar could cover: any text entry
 * (the on-screen keyboard is up), or keyboard focus anywhere in the inputs.
 * A tapped checkbox does not count, so toggles still show their effect.
 */
function isEditing(el: EventTarget | null): boolean {
  return (
    el instanceof Element &&
    (el.matches(TEXT_ENTRY) || (isFocusVisible(el) && el.closest(".inputs-col") !== null))
  );
}

function useEditing(): boolean {
  // The bar mounts with the first result, usually mid-typing: start from
  // whatever already has focus.
  const [editing, setEditing] = useState(() => isEditing(document.activeElement));
  useEffect(() => {
    const onIn = (e: FocusEvent) => setEditing(isEditing(e.target));
    const onOut = (e: FocusEvent) => setEditing(isEditing(e.relatedTarget));
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return editing;
}

/**
 * Phone-width summary pinned to the bottom of the viewport: the net-to-bank
 * figure and a link down to the full breakdown. It steps aside while the
 * results are on screen or a field is being edited, and is hidden by CSS at
 * desktop widths, where the results already ride along in the right column.
 * The figure is plain text, not a live region: it updates as you type
 * without announcing every keystroke.
 */
export function ResultsJump({ label, value }: { label: string; value: string }) {
  const inView = useInView(RESULTS_ID);
  const editing = useEditing();
  const reduce = usePrefersReducedMotion();

  // The href keeps the no-JS fallback; with JS we scroll and focus ourselves and
  // leave the URL alone on purpose. Inputs are never persisted, so a #results
  // kept in the URL would reopen (on reload or share) scrolled past the form
  // onto an empty-results placeholder.
  const jump = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(RESULTS_ID);
    if (!target) return;
    e.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <a
      className="results-jump"
      href={`#${RESULTS_ID}`}
      onClick={jump}
      data-hidden={inView || editing ? "" : undefined}
    >
      <span className="results-jump-sum">
        <span className="results-jump-label">{label}</span>{" "}
        <span className="results-jump-value">{value}</span>
      </span>{" "}
      <span className="results-jump-cta">
        See breakdown
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </a>
  );
}
