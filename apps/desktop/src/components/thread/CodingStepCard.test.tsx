import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodingStepCard } from "./CodingStepCard";

describe("CodingStepCard", () => {
  it("renders the code, the verbatim quote, and the memo", () => {
    render(
      <CodingStepCard
        block={{
          kind: "coding-step",
          quote: "坐班那套让我觉得自己在演戏",
          code: "表演性",
          memo: "把例行公事体验为被迫表演",
        }}
      />,
    );
    expect(screen.getByText("表演性")).toBeInTheDocument();
    expect(screen.getByText(/坐班那套让我觉得自己在演戏/)).toBeInTheDocument();
    expect(screen.getByText("把例行公事体验为被迫表演")).toBeInTheDocument();
  });

  it("shows the code + quote even with no memo", () => {
    const { container } = render(
      <CodingStepCard block={{ kind: "coding-step", quote: "收入不稳定", code: "收入焦虑" }} />,
    );
    expect(container.textContent).toContain("收入焦虑");
    expect(container.textContent).toContain("收入不稳定");
  });

  it("gives the same code a stable color across cards", () => {
    const { container: a } = render(
      <CodingStepCard block={{ kind: "coding-step", quote: "q1", code: "表演性" }} />,
    );
    const { container: b } = render(
      <CodingStepCard block={{ kind: "coding-step", quote: "q2", code: "表演性" }} />,
    );
    const chipA = a.querySelector("[data-code-chip]") as HTMLElement | null;
    const chipB = b.querySelector("[data-code-chip]") as HTMLElement | null;
    expect(chipA?.style.backgroundColor).toBe(chipB?.style.backgroundColor);
    expect(chipA?.style.backgroundColor).toMatch(/--series-/);
  });
});
