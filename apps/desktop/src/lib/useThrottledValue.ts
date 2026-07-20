import { useEffect, useRef, useState } from "react";

/**
 * The latest `value`, propagated at most once per `ms` — trailing edge
 * guaranteed. For a prop that changes on every streamed token feeding an
 * expensive consumer (a full markdown re-parse): the consumer updates on a
 * bounded cadence and always settles on the final value once the stream stops.
 * The first change after a quiet period passes through immediately.
 */
export function useThrottledValue<T>(value: T, ms: number): T {
  const [display, setDisplay] = useState(value);
  const lastApplied = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    if (Object.is(value, display)) return;
    const wait = Math.max(0, lastApplied.current + ms - Date.now());
    const id = window.setTimeout(() => {
      lastApplied.current = Date.now();
      setDisplay(value);
    }, wait);
    return () => window.clearTimeout(id);
  }, [value, ms, display]);
  return display;
}
