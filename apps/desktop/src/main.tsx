import "./lib/polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./app/providers/ThemeProvider";
import { LocaleProvider } from "./app/providers/LocaleProvider";
import { router } from "./app/router";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
