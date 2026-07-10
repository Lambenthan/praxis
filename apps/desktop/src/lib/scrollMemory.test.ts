// Scroll memory: a container comes back to where the user left it — per key,
// only once the content is ready, and a draft's offset follows its session id.
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef, type UIEvent } from "react";
import { clearScrollMemory, moveScrollMemory, useScrollMemory } from "./scrollMemory";

function mount(key: string, ready: boolean, el: HTMLElement) {
  return renderHook(
    ({ k, r }: { k: string; r: boolean }) => {
      const ref = useRef<HTMLElement | null>(el);
      return useScrollMemory(ref, k, r);
    },
    { initialProps: { k: key, r: ready } },
  );
}

const scrollTo = (el: HTMLElement, top: number, onScroll: (e: UIEvent<HTMLElement>) => void) => {
  el.scrollTop = top;
  onScroll({ currentTarget: el } as unknown as UIEvent<HTMLElement>);
};

beforeEach(() => clearScrollMemory());

describe("useScrollMemory", () => {
  it("restores the recorded offset when the same key mounts again", () => {
    const a = document.createElement("div");
    const first = mount("file:/ws/a.md", true, a);
    scrollTo(a, 120, first.result.current);
    first.unmount();

    const b = document.createElement("div");
    mount("file:/ws/a.md", true, b);
    expect(b.scrollTop).toBe(120);
  });

  it("keeps keys independent and defaults an unknown key to the top", () => {
    const a = document.createElement("div");
    const first = mount("file:/ws/a.md", true, a);
    scrollTo(a, 120, first.result.current);

    const b = document.createElement("div");
    b.scrollTop = 55; // leftover position from whatever was shown before
    mount("file:/ws/other.md", true, b);
    expect(b.scrollTop).toBe(0);
  });

  it("waits for ready before restoring (content not loaded yet)", () => {
    const a = document.createElement("div");
    const first = mount("chat:ses_1", true, a);
    scrollTo(a, 300, first.result.current);
    first.unmount();

    const b = document.createElement("div");
    const again = mount("chat:ses_1", false, b);
    expect(b.scrollTop).toBe(0);
    again.rerender({ k: "chat:ses_1", r: true });
    expect(b.scrollTop).toBe(300);
  });

  it("ignores scroll events while not ready — a loading placeholder's clamp must not overwrite the real offset", () => {
    const a = document.createElement("div");
    const h = mount("chat:ses_1", true, a);
    scrollTo(a, 200, h.result.current);
    h.rerender({ k: "chat:ses_1", r: false });
    scrollTo(a, 0, h.result.current); // content swapped for a skeleton, browser clamps
    h.rerender({ k: "chat:ses_1", r: true });
    expect(a.scrollTop).toBe(200);
  });

  it("moveScrollMemory re-keys an offset (draft → real session id)", () => {
    const a = document.createElement("div");
    const first = mount("chat:draft", true, a);
    scrollTo(a, 80, first.result.current);
    moveScrollMemory("chat:draft", "chat:ses_new");

    const b = document.createElement("div");
    mount("chat:ses_new", true, b);
    expect(b.scrollTop).toBe(80);
  });
});
