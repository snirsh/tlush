// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AnimatedValue } from "../components/ui";

/** Text a screen reader would read: everything outside aria-hidden subtrees. */
function spokenText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return clone.textContent ?? "";
}

function visibleText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".visually-hidden").forEach((n) => n.remove());
  return clone.textContent ?? "";
}

const format = (n: number) => n.toFixed(0);

function stubFrames() {
  let pending: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending.push(cb);
    return pending.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  return (ts: number) =>
    act(() => {
      const run = pending;
      pending = [];
      run.forEach((cb) => cb(ts));
    });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AnimatedValue", () => {
  it("rolls the visible digits but only ever exposes the final value", () => {
    const frame = stubFrames();
    const { container } = render(<AnimatedValue value={1000} format={format} duration={100} />);
    const num = container.querySelector(".num") as HTMLElement;

    frame(1);
    frame(50);
    expect(visibleText(num)).not.toBe("1000");
    expect(spokenText(num)).toBe("1000");

    frame(200);
    expect(num).toHaveTextContent(/^1000$/);
    expect(spokenText(num)).toBe("1000");
  });

  it("shows the final value at once when the user prefers reduced motion", () => {
    stubFrames();
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
      addEventListener() {},
      removeEventListener() {},
    }));
    const { container } = render(<AnimatedValue value={1000} format={format} />);
    expect(container.querySelector(".num")).toHaveTextContent(/^1000$/);
  });
});
