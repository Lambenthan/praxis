import { describe, expect, it } from "vitest";
import { SCIENCE_CONNECTORS, connectorConfig } from "./scienceConnectors";

const byId = (id: string) => {
  const c = SCIENCE_CONNECTORS.find((x) => x.id === id);
  if (!c) throw new Error(`no connector ${id}`);
  return c;
};

describe("connectorConfig", () => {
  it("launches a `-m module` connector (paper-search)", () => {
    const cfg = connectorConfig(byId("paper-search"), "/env/bin/python");
    expect(cfg).toMatchObject({
      type: "local",
      command: ["/env/bin/python", "-m", "paper_search_mcp.server"],
      enabled: true,
    });
    expect(cfg.type === "local" && cfg.environment).toBeUndefined();
  });

  it("launches a console-script connector beside the interpreter (unix)", () => {
    const cfg = connectorConfig(byId("stata"), "/env/bin/python");
    expect(cfg.type === "local" && cfg.command).toEqual(["/env/bin/stata-mcp"]);
  });

  it("resolves the console script on Windows with .exe", () => {
    const cfg = connectorConfig(byId("fred"), "C:\\env\\Scripts\\python.exe", "KEY");
    expect(cfg.type === "local" && cfg.command).toEqual([
      "C:\\env\\Scripts\\fred-mcp.exe",
    ]);
  });

  it("passes an API key via environment, trimmed", () => {
    const cfg = connectorConfig(byId("fred"), "/env/bin/python", "  fred-secret  ");
    expect(cfg.type === "local" && cfg.environment).toEqual({ FRED_API_KEY: "fred-secret" });
  });

  it("omits environment when the key is blank", () => {
    const cfg = connectorConfig(byId("fred"), "/env/bin/python", "   ");
    expect(cfg.type === "local" && cfg.environment).toBeUndefined();
  });

  it("carries a connector's static env (zotero local mode, no key needed)", () => {
    const c = byId("zotero");
    expect(c.apiKeyEnv).toBeUndefined(); // local Zotero API, keyless
    const cfg = connectorConfig(c, "/env/bin/python");
    expect(cfg.type === "local" && cfg.command).toEqual(["/env/bin/zotero-mcp"]);
    expect(cfg.type === "local" && cfg.environment).toEqual({ ZOTERO_LOCAL: "true" });
  });

  it("every connector declares an id, discipline, package, and a launch path", () => {
    for (const c of SCIENCE_CONNECTORS) {
      expect(c.id && c.discipline && c.pkg && c.source).toBeTruthy();
      expect(Boolean(c.bin) || Boolean(c.module)).toBe(true);
      if (c.apiKeyEnv) expect(c.apiKeyUrl).toBeTruthy(); // key-needing → tell users where to get one
    }
  });

  it("ships the social-science core: literature, references, statistics, economics", () => {
    const ids = new Set(SCIENCE_CONNECTORS.map((c) => c.id));
    for (const id of ["paper-search", "zotero", "stata", "fred"]) {
      expect(ids.has(id)).toBe(true);
    }
    const disciplines = new Set(SCIENCE_CONNECTORS.map((c) => c.discipline));
    expect(disciplines.has("statistics")).toBe(true);
    expect(disciplines.has("economics")).toBe(true);
  });

  it("launches Stata as a console script with a local-install note (no key)", () => {
    const c = byId("stata");
    expect(c.apiKeyEnv).toBeUndefined(); // drives the local Stata, no API key
    expect(c.installNote).toBeTruthy(); // must warn that Stata itself is required
  });
});
