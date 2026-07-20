import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Persisted pane width with clamping — every fixed-width pane in the library
 *  is user-resizable (a hard project rule after the fixed-pane squeeze bugs).
 *  The rendered width is additionally capped to a viewport fraction, so a
 *  wide remembered pane can't push the content off-screen on a small window. */
export function useStoredWidth(
  key: string,
  def: number,
  min: number,
  max: number,
): [number, (w: number) => void] {
  const [w, setW] = useState(() => {
    const saved = Number(localStorage.getItem(key));
    return Number.isFinite(saved) && saved > 0 ? Math.min(max, Math.max(min, saved)) : def;
  });
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1440));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    setW(clamped);
    try {
      localStorage.setItem(key, String(clamped));
    } catch {
      /* storage unavailable — width still applies this session */
    }
  };
  return [Math.max(min, Math.min(w, Math.round(vw * 0.45))), set];
}

/**
 * Drag handle on a pane's edge. `edge` names WHICH edge of the pane it sits
 * on: dragging away from the pane grows it, toward it shrinks it — delta
 * math is handled here so panes just pass their width setter.
 */
export function ResizeEdge({
  edge,
  width,
  onResize,
}: {
  edge: "left" | "right";
  width: number;
  onResize: (w: number) => void;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        onResize(start.current.w + (edge === "left" ? -dx : dx));
      }}
      onPointerUp={() => {
        start.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      className={cn(
        "group absolute inset-y-0 z-10 w-[5px] cursor-col-resize",
        edge === "left" ? "left-0" : "right-0",
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 w-[2px] transition-colors",
          edge === "left" ? "left-0" : "right-0",
          dragging ? "bg-accent/60" : "bg-transparent group-hover:bg-accent/40",
        )}
      />
    </div>
  );
}
