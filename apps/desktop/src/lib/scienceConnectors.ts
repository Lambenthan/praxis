// Curated open-source social-science MCP connectors (P1-2). These are existing,
// maintained open-source MCP servers — we one-click provision them into a
// shared isolated env (bundled uv) and register them; we do not reimplement
// literature/database access ourselves. Keep this list small and vetted:
// every entry must be a real PyPI package with a working launch entry that
// installs on the managed Python 3.12 env (see src-tauri/science_mcp.rs).
import type { McpConfig } from "@fishes/sdk";

export interface ScienceConnector {
  /** MCP server name written into OpenCode's config. */
  id: string;
  label: string;
  /** Short discipline chip, e.g. "statistics", "economics". */
  discipline: string;
  description: string;
  /** PyPI package installed into the shared science-MCP env. */
  pkg: string;
  /** Console script the package installs (resolved next to the managed python).
   *  Preferred when set — many MCP servers ship a script, not a `-m` module. */
  bin?: string;
  /** Fallback: Python `-m` module the server runs as, plus any args. */
  module?: string;
  args?: string[];
  /** Static env vars the server needs (e.g. a local-mode switch). */
  env?: Record<string, string>;
  /** Env var the server reads its API key from (free keys; never logged). */
  apiKeyEnv?: string;
  /** Where the user gets a free key. */
  apiKeyUrl?: string;
  /** Shown before Enable when the install is large. */
  installNote?: string;
  /** Upstream project, shown so users can vet it before enabling. */
  source: string;
}

export const SCIENCE_CONNECTORS: ScienceConnector[] = [
  {
    id: "paper-search",
    label: "Literature search",
    discipline: "all fields",
    description:
      "arXiv · PubMed · Crossref · Semantic Scholar · bioRxiv/medRxiv — search & fetch papers",
    pkg: "paper-search-mcp",
    module: "paper_search_mcp.server",
    source: "github.com/openags/paper-search-mcp",
  },
  {
    id: "stata",
    label: "Stata",
    discipline: "statistics",
    description:
      "Drive a locally installed Stata (MP/SE/BE) — the agent writes do-files, runs them, and reads the logs",
    // Pinned to 1.20.2 — the last version that runs do-files HEADLESS (batch,
    // writes .log). 1.21.0 switched to launching the macOS Stata GUI, which
    // pops a modal "已完成 [OK]" per run and blocks until clicked. Do not
    // un-pin without re-verifying the runner stays headless.
    pkg: "stata-mcp==1.20.2",
    bin: "stata-mcp",
    installNote: "requires Stata already installed on this machine",
    source: "github.com/sepinetam/mcp-for-stata",
  },
  {
    id: "zotero",
    label: "Zotero library",
    discipline: "all fields",
    description:
      "Search and read your local Zotero library — items, notes, and attachments, no API key needed",
    pkg: "zotero-mcp",
    bin: "zotero-mcp",
    env: { ZOTERO_LOCAL: "true" },
    installNote:
      "requires the Zotero desktop app running with its local API on (Settings → Advanced → Allow other applications)",
    source: "github.com/kujenga/zotero-mcp",
  },
  {
    id: "fred",
    label: "FRED economic data",
    discipline: "economics",
    description:
      "Federal Reserve (FRED) economic time series — GDP, inflation, unemployment, rates, and more",
    pkg: "fred-mcp",
    bin: "fred-mcp",
    apiKeyEnv: "FRED_API_KEY",
    apiKeyUrl: "https://fred.stlouisfed.org/docs/api/api_key.html",
    source: "github.com/tosin2013/fred-mcp",
  },
];

/** The bridge test returns the resolved Stata executable's PATH (e.g.
 *  "/Applications/Stata/StataMP.app/Contents/MacOS/stata-mp" or
 *  "C:\Program Files\Stata18\StataMP-64.exe"). The setup card and the ready
 *  bar name the edition, not a filesystem path. */
export function stataEditionLabel(cli: string): string {
  const m = /stata[-_ ]?(mp|se|be)/i.exec(cli);
  return m ? `Stata${m[1]!.toUpperCase()}` : "Stata";
}

/** Resolve a console script that sits next to the managed python interpreter
 *  (unix: `<env>/bin/<script>`; Windows: `<env>/Scripts/<script>.exe`). */
function scriptBeside(python: string, bin: string): string {
  const sep = python.includes("\\") ? "\\" : "/";
  const dir = python.slice(0, python.lastIndexOf(sep));
  const exe = python.toLowerCase().endsWith(".exe") ? ".exe" : "";
  return `${dir}${sep}${bin}${exe}`;
}

/** Local-MCP config for a connector, given the managed interpreter path and an
 *  optional API key (passed via env, never written to provenance/logs). */
export function connectorConfig(
  c: ScienceConnector,
  python: string,
  apiKey?: string,
): McpConfig {
  const command = c.bin
    ? [scriptBeside(python, c.bin)]
    : [python, "-m", c.module ?? "", ...(c.args ?? [])];
  const config: McpConfig = { type: "local", command, enabled: true };
  const environment: Record<string, string> = { ...(c.env ?? {}) };
  if (c.apiKeyEnv && apiKey && apiKey.trim()) {
    environment[c.apiKeyEnv] = apiKey.trim();
  }
  if (Object.keys(environment).length > 0) config.environment = environment;
  return config;
}
