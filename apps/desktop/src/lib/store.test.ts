import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./store";

describe("uiStore theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ theme: "light" });
  });

  it("toggles theme and persists to localStorage", () => {
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe("dark");
    expect(window.localStorage.getItem("ai4s.theme")).toBe("dark");

    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe("light");
    expect(window.localStorage.getItem("ai4s.theme")).toBe("light");
  });
});
