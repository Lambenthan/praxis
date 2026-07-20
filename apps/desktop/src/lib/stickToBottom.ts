import { useCallback, useLayoutEffect, useRef, type RefObject, type UIEvent } from "react";

/** Distance from the bottom (px) that still counts as "at the bottom". */
const THRESHOLD = 80;

/**
 * Keep a scroll container pinned to the bottom as content grows — the standard
 * chat behaviour so a streaming reply stays in view without the user scrolling.
 * Following is conditional: it holds only while the user is already near the
 * bottom, so scrolling up to read history stops it, and scrolling back down
 * resumes it.
 *
 * Coexists with `useScrollMemory` (which restores a remembered offset on a
 * session switch): pass the SAME `key`, and on a key change this hook yields —
 * it reads where memory restored to and follows from there, instead of yanking
 * to the bottom. Only same-session content growth (new/streamed blocks, via
 * `dep`) triggers a follow. Attach the returned handler as `onScroll` alongside
 * the memory handler.
 */
export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  key: string,
  dep: unknown,
  active = true,
): (e: UIEvent<HTMLElement>) => void {
  const stuck = useRef(true);
  // Null until the first run, so the initial mount is treated as a "switch"
  // too — it yields to scroll memory instead of yanking to the bottom.
  const lastKey = useRef<string | null>(null);
  // One pending follow write at a time (see below).
  const pending = useRef(false);
  const rafId = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    // Session switched (or first mount): scroll memory owns the position. Adopt
    // wherever it restored to as the new follow baseline (bottom → keep going).
    if (lastKey.current !== key) {
      lastKey.current = key;
      stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
      return;
    }
    // Same session, content grew: stay at the bottom if we were there. The
    // write is coalesced through requestAnimationFrame — SSE streaming commits
    // once per event (often several per frame), and a synchronous scrollHeight
    // read after each commit forces a full reflow each time (layout thrash).
    // One rAF = one layout, right before the frame paints anyway.
    if (!stuck.current || pending.current) return;
    pending.current = true;
    rafId.current = requestAnimationFrame(() => {
      pending.current = false;
      const live = ref.current;
      if (live && stuck.current) live.scrollTop = live.scrollHeight;
    });
  }, [ref, key, dep, active]);

  // Unmount: drop the scheduled write — the container is gone.
  useLayoutEffect(() => () => cancelAnimationFrame(rafId.current), []);

  return useCallback((e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
  }, []);
}
