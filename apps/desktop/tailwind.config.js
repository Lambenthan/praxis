/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (existing usage) — re-pointed onto the handoff ramp.
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        faint: "var(--border-faint)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        link: "var(--link)",
        warn: "var(--warn)",
        ok: "var(--ok)",
        error: "var(--error)",
        // Handoff raw ramp — used verbatim by the Agent Workbench surfaces
        // (sidebar rail, tabs, tool cards, composer dock, files). Access as
        // e.g. bg-bg-200, text-text-300, border-border-300, bg-clay.
        "bg-000": "var(--bg-000)",
        "bg-100": "var(--bg-100)",
        "bg-200": "var(--bg-200)",
        "bg-300": "var(--bg-300)",
        "bg-400": "var(--bg-400)",
        "rail-card": "var(--rail-card-bg)",
        "text-000": "var(--text-000)",
        "text-100": "var(--text-100)",
        "text-200": "var(--text-200)",
        "text-300": "var(--text-300)",
        "text-400": "var(--text-400)",
        "border-300": "var(--border-300)",
        clay: "var(--clay)",
        "clay-emph": "var(--clay-emph)",
        mineral: "var(--mineral)",
        code: "var(--code)",
        danger: "var(--error)",
        "tool-card": "var(--tool-card-bg)",
        "tool-out": "var(--tool-out-bg)",
        "code-bg": "var(--code-bg)",
      },
      fontFamily: {
        // font-serif = the journal manuscript convention: Times New Roman for
        // Latin and digits, 宋体 for Chinese (Songti SC on macOS, SimSun on
        // Windows) — the browser falls back per glyph. Both are system fonts,
        // nothing to bundle. Used by the regression table, manuscripts, page
        // and card headings; UI body stays sans (font-sans).
        // Serif face: Anthropic Serif (real Claude Science face, local-only) →
        // Times New Roman / Songti fallback when the proprietary font is absent.
        serif: ["'Anthropic Serif'", "'Times New Roman'", "'Songti SC'", "SimSun", "'Songti TC'", "serif"],
        // UI face: matches Claude Science's exact stack — Anthropic Sans →
        // Hanken (free fallback) → system-ui, which lets the OS pick the CJK
        // face per language (Chinese→PingFang, Japanese→Hiragino), same as live.
        sans: ["'Anthropic Sans'", "'Hanken Grotesk'", "system-ui", "'Segoe UI'", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["'Anthropic Mono'", "'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "'PingFang SC'", "monospace"],
      },
      borderRadius: {
        // cds radii: base --radius is 6px; the rail card measured rounded-lg (8px)
        // on the live app. Cards/dock/bubble stay larger; verified by screenshot.
        card: "12px",
        input: "6px",
        rail: "8px",
        dock: "16px",
        tool: "14px",
        bubble: "16px",
        code: "6px",
      },
      boxShadow: {
        // EXACT cds shadows (--cds-shadow-sm / -md / -popover), black-alpha.
        rail: "0 1px 2px 0 rgba(11,11,11,0.06), 0 2px 8px 0 rgba(11,11,11,0.08)",
        card: "0 1px 2px 0 rgba(11,11,11,0.06), 0 2px 8px 0 rgba(11,11,11,0.08)",
        dock: "0 0 0 1px var(--border), 0 2px 4px 0 rgba(11,11,11,0.07), 0 6px 16px 0 rgba(11,11,11,0.08)",
        pop: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};
