import { useLayoutEffect, type RefObject, type UIEvent } from "react";

/** Scroll offsets by pane key, kept for the app's lifetime — switching
 *  sessions or files comes back to where the user left off. Lives outside the
 *  store so scroll events never trigger React renders. */
const offsets = new Map<string, number>();

/** Re-key a stored offset (a draft's chat scroll follows the session id it
 *  becomes — the page must not jump on the first message). */
export function moveScrollMemory(from: string, to: string): void {
  const v = offsets.get(from);
  if (v !== undefined) {
    offsets.set(to, v);
    offsets.delete(from);
  }
}

/** Test seam / explicit reset. */
export function clearScrollMemory(): void {
  offsets.clear();
}

/**
 * Remember and restore a container's scrollTop under `key`. Attach the
 * returned handler as `onScroll`; pass `ready=false` until the content is
 * loaded (restoring against an empty container would clamp to 0). Restores
 * once per key+ready settle, so live content updates never yank the scroll.
 * While not ready nothing is recorded either — swapping in a loading
 * placeholder shrinks the container, and the browser's clamped scroll event
 * would overwrite the real offset with a bogus one.
 */
export function useScrollMemory(
  ref: RefObject<HTMLElement | null>,
  key: string,
  ready = true,
): (e: UIEvent<HTMLElement>) => void {
  useLayoutEffect(() => {
    if (ready && ref.current) ref.current.scrollTop = offsets.get(key) ?? 0;
  }, [ref, key, ready]);
  return (e) => {
    if (ready) offsets.set(key, e.currentTarget.scrollTop);
  };
}
