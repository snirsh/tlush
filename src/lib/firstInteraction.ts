const EVENTS = ["pointerdown", "keydown", "focusin"] as const;

/**
 * Run `run` once, on the user's first press, key or focus anywhere on the page.
 * Keeps third-party lookups off the initial load. Returns an unsubscribe.
 */
export function onFirstInteraction(run: () => void): () => void {
  const stop = () => EVENTS.forEach((e) => document.removeEventListener(e, fire, true));
  function fire() {
    stop();
    run();
  }
  EVENTS.forEach((e) => document.addEventListener(e, fire, { capture: true, passive: true }));
  return stop;
}
