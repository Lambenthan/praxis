import { useEffect, useRef, useState } from "react";

/**
 * Seconds elapsed while `active`, ticking once a second; resets when it stops.
 * Gives a running turn or subagent the "it's been 0:23" liveness a long task
 * needs — the way Claude Code shows elapsed time next to its working spinner.
 */
export function useElapsed(active: boolean): number {
  const [n, setN] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      start.current = null;
      setN(0);
      return;
    }
    if (start.current == null) start.current = Date.now();
    const id = setInterval(
      () => setN(Math.floor((Date.now() - (start.current ?? Date.now())) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [active]);
  return n;
}

/** Seconds as `m:ss` (e.g. 83 → "1:23"). */
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
