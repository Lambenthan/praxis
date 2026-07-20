import "./lib/polyfills";
// Carry pre-rename `praxis.*` UI prefs to `fishes.*` BEFORE any module reads its
// key. Placed above ./lib/zoom on purpose — import side effects run in order.
import "./lib/migratePraxisKeys";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./app/providers/ThemeProvider";
import { LocaleProvider } from "./app/providers/LocaleProvider";
import { router } from "./app/router";
import "./index.css";
// Apply the persisted UI zoom before first paint (⌘+/⌘−/⌘0, browser-style).
import "./lib/zoom";

// Proprietary Anthropic faces are local-only + git-ignored. Load them tolerantly:
// glob resolves to the file when it exists (local dev → pixel-identical fonts) and
// to nothing in a published clone that lacks it (→ Hanken / IBM Plex Mono fallback,
// build never breaks). A hard `@import` of the git-ignored file would fail the build.
import.meta.glob("./fonts/anthropic.css", { eager: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
