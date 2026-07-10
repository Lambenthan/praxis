import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UIEvent } from "react";
import { useStickToBottom } from "./stickToBottom";

/** A fake scroll container: 1000 tall, 300 visible → bottom is scrollTop 700. */
function fakeEl(scrollTop = 0) {
  return { scrollTop, scrollHeight: 1000, clientHeight: 300 } as unknown as HTMLElement;
}
const scrollEvent = (el: HTMLElement) => ({ currentTarget: el }) as unknown as UIEvent<HTMLElement>;

describe("useStickToBottom", () => {
  it("does not yank to the bottom on first mount (scroll memory owns it)", () => {
    const el = fakeEl(0);
    const ref = { current: el };
    renderHook(({ dep }) => useStickToBottom(ref, "s1", dep), { initialProps: { dep: 0 } });
    expect(el.scrollTop).toBe(0); // untouched — memory decides the initial offset
  });

  it("follows the bottom as content grows while the user is at the bottom", () => {
    const el = fakeEl(0);
    const ref = { current: el };
    const { result, rerender } = renderHook(({ dep }) => useStickToBottom(ref, "s1", dep), {
      initialProps: { dep: 0 },
    });
    // User is at the bottom (scrollTop 700 of 1000−300); the handler records it.
    el.scrollTop = 700;
    result.current(scrollEvent(el));
    // New content arrives → the view sticks to the (new) bottom.
    rerender({ dep: 1 });
    expect(el.scrollTop).toBe(1000);
  });

  it("stops following once the user scrolls up to read history", () => {
    const el = fakeEl(0);
    const ref = { current: el };
    const { result, rerender } = renderHook(({ dep }) => useStickToBottom(ref, "s1", dep), {
      initialProps: { dep: 0 },
    });
    // User scrolls up (far from the bottom) — following pauses.
    el.scrollTop = 100;
    result.current(scrollEvent(el));
    rerender({ dep: 1 });
    expect(el.scrollTop).toBe(100); // held where the user is, not pinned to bottom
  });

  it("resumes following when the user scrolls back down to the bottom", () => {
    const el = fakeEl(0);
    const ref = { current: el };
    const { result, rerender } = renderHook(({ dep }) => useStickToBottom(ref, "s1", dep), {
      initialProps: { dep: 0 },
    });
    el.scrollTop = 100;
    result.current(scrollEvent(el)); // up
    rerender({ dep: 1 });
    el.scrollTop = 700;
    result.current(scrollEvent(el)); // back to bottom
    rerender({ dep: 2 });
    expect(el.scrollTop).toBe(1000);
  });

  it("yields to scroll memory on a session switch instead of pinning bottom", () => {
    const el = fakeEl(700);
    const ref = { current: el };
    const { rerender } = renderHook(({ k, dep }) => useStickToBottom(ref, k, dep), {
      initialProps: { k: "s1", dep: 0 },
    });
    // Simulate memory restoring the new session to an up-scrolled offset, then
    // the key change landing in the same commit.
    el.scrollTop = 120;
    rerender({ k: "s2", dep: 0 });
    expect(el.scrollTop).toBe(120); // adopted, not yanked to 1000
  });
});
