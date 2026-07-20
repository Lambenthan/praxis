import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThrottledValue } from "./useThrottledValue";

describe("useThrottledValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passes the first change through immediately", () => {
    const { result, rerender } = renderHook(({ v }) => useThrottledValue(v, 150), {
      initialProps: { v: "a" },
    });
    expect(result.current).toBe("a");
    rerender({ v: "ab" });
    act(() => void vi.advanceTimersByTime(0));
    expect(result.current).toBe("ab");
  });

  it("coalesces a token burst into one trailing update with the final value", () => {
    const { result, rerender } = renderHook(({ v }) => useThrottledValue(v, 150), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    act(() => void vi.advanceTimersByTime(0)); // first change lands
    // A per-token burst inside the throttle window stays held back…
    rerender({ v: "abc" });
    rerender({ v: "abcd" });
    rerender({ v: "abcde" });
    expect(result.current).toBe("ab");
    // …and the trailing edge lands exactly the final value.
    act(() => void vi.advanceTimersByTime(150));
    expect(result.current).toBe("abcde");
  });
});
