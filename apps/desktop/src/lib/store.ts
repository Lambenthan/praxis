import { create } from "zustand";

export type Theme = "light" | "dark";

const THEME_KEY = "ai4s.theme";
const SIDEBAR_WIDTH_KEY = "ai4s.sidebar.width";
const SIDEBAR_COLLAPSED_KEY = "ai4s.sidebar.collapsed";
const INSPECTOR_WIDTH_KEY = "ai4s.inspector.width";
const GUIDED_MODE_KEY = "fishes.guided-mode";

export const SIDEBAR_MIN = 184;
export const SIDEBAR_MAX = 340;
export const SIDEBAR_DEFAULT = 220; // handoff rail width

export const INSPECTOR_MIN = 360;
export const INSPECTOR_MAX = 960;
export const INSPECTOR_DEFAULT = 560;

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

function initialSidebarWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT;
  const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(saved) || saved === 0) return SIDEBAR_DEFAULT;
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, saved));
}

function initialInspectorWidth(): number {
  if (typeof window === "undefined") return INSPECTOR_DEFAULT;
  const saved = Number(window.localStorage.getItem(INSPECTOR_WIDTH_KEY));
  if (!Number.isFinite(saved) || saved === 0) return INSPECTOR_DEFAULT;
  return Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, saved));
}

interface UiState {
  theme: Theme;
  inspectorOpen: boolean;
  /** Right-pane width in px (persisted); the pane can also be maximized to
   *  cover the whole window (session-ephemeral, reset when the pane closes). */
  inspectorWidth: number;
  inspectorMaximized: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  paletteOpen: boolean;
  /** One-shot text placed into the composer by another surface (e.g. the
   *  provenance Reproduce action) — consumed on the next composer render. */
  composerDraft: string | null;
  /** Guided research mode: when on, the "start a project" entries bind the
   *  resident research navigator (step-by-step guidance). When off — the
   *  default — they only set up the folder and leave the researcher in
   *  charge. Persisted; also flippable per session in the header. */
  guidedMode: boolean;
  setGuidedMode: (on: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorWidth: (width: number) => void;
  setInspectorMaximized: (maximized: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setPaletteOpen: (open: boolean) => void;
  setComposerDraft: (draft: string | null) => void;
  /** VS-Code-style soft gate: with no project open, the workspace gate blocks
   *  the composer until the researcher opens/creates a project — OR explicitly
   *  chooses to work in a blank scratch workspace (this flag). Session-ephemeral
   *  (resets each launch) so the gate reappears next start. */
  blankWorkspaceOk: boolean;
  setBlankWorkspaceOk: (ok: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme(),
  // Start closed so a session opens with the conversation at full width — the
  // inspector opens when the user (or the agent, for notebooks) opens an
  // artifact. Auto-expanding it on entry squeezed the thread, badly so on
  // narrow windows / zoomed-in views.
  inspectorOpen: false,
  sidebarCollapsed:
    typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1",
  sidebarWidth: initialSidebarWidth(),
  paletteOpen: false,
  setTheme: (theme) => {
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "light" ? "dark" : "light"),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  inspectorWidth: initialInspectorWidth(),
  inspectorMaximized: false,
  setInspectorWidth: (width) => {
    const inspectorWidth = Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, Math.round(width)));
    if (typeof window !== "undefined")
      window.localStorage.setItem(INSPECTOR_WIDTH_KEY, String(inspectorWidth));
    set({ inspectorWidth });
  },
  setInspectorMaximized: (inspectorMaximized) => set({ inspectorMaximized }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    set({ sidebarCollapsed });
  },
  toggleSidebar: () => get().setSidebarCollapsed(!get().sidebarCollapsed),
  setSidebarWidth: (width) => {
    const sidebarWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)));
    if (typeof window !== "undefined")
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    set({ sidebarWidth });
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  blankWorkspaceOk: false,
  setBlankWorkspaceOk: (blankWorkspaceOk) => set({ blankWorkspaceOk }),
  composerDraft: null,
  setComposerDraft: (composerDraft) => set({ composerDraft }),
  guidedMode:
    typeof window !== "undefined" && window.localStorage.getItem(GUIDED_MODE_KEY) === "1",
  setGuidedMode: (guidedMode) => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(GUIDED_MODE_KEY, guidedMode ? "1" : "0");
    set({ guidedMode });
  },
}));
