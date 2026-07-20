import { create } from "zustand";
import { isTauri } from "./tauri";

/**
 * Browser-style UI zoom for the whole app. ⌘+ / ⌘− / ⌘0 (Ctrl on Windows/Linux)
 * step through a fixed ladder, exactly like a browser, and the choice persists.
 *
 * In the packaged app we drive the NATIVE webview zoom (`setZoom`) — true browser
 * zoom that reflows everything, including the `w-screen`/`h-screen` shell and any
 * viewport units, with no distortion. CSS `zoom` is used ONLY as the dev-server /
 * plain-browser fallback (there it can't reach the native API); it's good enough
 * for dev but would warp the viewport-locked shell in production, which is why the
 * real app never uses it. The two paths are environment-exclusive, so no double zoom.
 */

const ZOOM_KEY = "fishes.ui-zoom";

// The browser zoom ladder (Chrome's set), so ⌘+/⌘− feel identical to one.
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0] as const;
const STEPS: readonly number[] = ZOOM_STEPS;
// Default one notch above 100% — the size that reads "just right" on a MacBook
// (matches pressing ⌘+ once from actual size). ⌘0 resets here; ⌘− still reaches 100%.
export const ZOOM_DEFAULT = 1.1;

function clampToStep(f: number): number {
  let best = STEPS[0];
  let dist = Infinity;
  for (const s of STEPS) {
    const d = Math.abs(s - f);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

function readStored(): number {
  if (typeof window === "undefined") return ZOOM_DEFAULT;
  const v = Number(window.localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(v) && v > 0 ? clampToStep(v) : ZOOM_DEFAULT;
}

function persist(f: number): void {
  try {
    window.localStorage.setItem(ZOOM_KEY, String(f));
  } catch {
    /* private mode / disabled storage — zoom still applies this session */
  }
}

/** CSS-zoom fallback for dev/browser only (no native webview there). */
function cssZoom(factor: number): void {
  if (typeof document === "undefined") return;
  (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(factor);
}

/** Scale the entire UI. Native webview zoom in the packaged app (true browser
 *  zoom, reflows correctly); CSS-zoom fallback in dev/browser. */
export function applyZoom(factor: number): void {
  if (isTauri) {
    // Make sure the CSS fallback isn't also applied (e.g. from an earlier boot path).
    if (typeof document !== "undefined") {
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = "";
    }
    void import("@tauri-apps/api/webview")
      .then((m) => m.getCurrentWebview().setZoom(factor))
      .catch(() => cssZoom(factor)); // permission missing → degrade rather than do nothing
    return;
  }
  cssZoom(factor);
}

interface ZoomState {
  zoom: number;
  setZoom: (factor: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const useZoomStore = create<ZoomState>((set, get) => ({
  zoom: readStored(),
  setZoom: (factor) => {
    const z = clampToStep(factor);
    persist(z);
    applyZoom(z);
    set({ zoom: z });
  },
  zoomIn: () => {
    const i = STEPS.indexOf(get().zoom);
    get().setZoom(STEPS[Math.min(STEPS.length - 1, (i < 0 ? STEPS.indexOf(ZOOM_DEFAULT) : i) + 1)]);
  },
  zoomOut: () => {
    const i = STEPS.indexOf(get().zoom);
    get().setZoom(STEPS[Math.max(0, (i < 0 ? STEPS.indexOf(ZOOM_DEFAULT) : i) - 1)]);
  },
  resetZoom: () => get().setZoom(ZOOM_DEFAULT),
}));

/** Global ⌘/Ctrl +/−/0 shortcuts, browser-identical. Returns a cleanup fn. */
export function installZoomHotkeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    // "+" needs Shift on most layouts, so accept both "=" and "+"; likewise "_".
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      useZoomStore.getState().zoomIn();
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      useZoomStore.getState().zoomOut();
    } else if (e.key === "0") {
      e.preventDefault();
      useZoomStore.getState().resetZoom();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

// Apply the persisted zoom as soon as this module loads (before first paint when
// imported early from main.tsx), so a saved 110% doesn't flash at 100% on boot.
applyZoom(readStored());
