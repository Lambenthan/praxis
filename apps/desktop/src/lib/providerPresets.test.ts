import { describe, expect, it } from "vitest";
import { explainCheckError } from "./providerPresets";

describe("explainCheckError", () => {
  it("maps known codes to a plain-language fix and keeps the raw detail", () => {
    const r = explainCheckError(new Error("no_balance: HTTP 402 Insufficient Balance"));
    expect(r.message).toContain("no balance");
    expect(r.detail).toContain("HTTP 402");
  });

  it("invalid_key tells the user to re-copy the key", () => {
    expect(explainCheckError("invalid_key: HTTP 401").message).toContain("Copy it again");
  });

  it("network errors point at the connection, not the key", () => {
    expect(explainCheckError("network: timed out after 15s").message).toContain("connection");
  });

  it("unknown codes fall through to the real message — nothing is swallowed", () => {
    const r = explainCheckError(new Error("something odd happened"));
    expect(r.message).toBe("something odd happened");
    expect(r.detail).toBe("");
  });

  it("stata bridge codes translate too", () => {
    // "wasn't found" + the manual-pick pointer — never a "you don't have
    // Stata" verdict (scans are heuristics; the user has the final say).
    expect(explainCheckError("stata_not_found: none").message).toContain(
      "Choose the Stata program manually",
    );
    expect(explainCheckError("stata_pick_invalid: dir").message).toContain(
      "pick the Stata executable",
    );
  });
});
