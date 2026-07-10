/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        serif: ["'Newsreader'", "'Songti SC'", "'Noto Serif CJK SC'", "SimSun", "Georgia", "serif"],
        sans: ["'Geist Sans'", "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "'PingFang SC'", "'Microsoft YaHei'", "monospace"],
      },
      borderRadius: {
        card: "14px",
        input: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(40, 39, 35, 0.04), 0 4px 16px rgba(40, 39, 35, 0.05)",
        pop: "0 8px 30px rgba(40, 39, 35, 0.14)",
      },
    },
  },
  plugins: [],
};
