import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QRegWorkbench } from "./QRegWorkbench";

const text = JSON.stringify({
  title: "Price determinants",
  depvar: "price",
  models: [
    {
      name: "(1) OLS",
      cmd: "regress price mpg weight",
      n: 74,
      r2: 0.2934,
      coefs: [
        { var: "mpg", b: -49.512, se: 86.156, p: 0.567 },
        { var: "weight", b: 1.747, se: 0.641, p: 0.008 },
        { var: "_cons", b: 1946.069, se: 3597.05, p: 0.59 },
      ],
      status: "candidate",
    },
    {
      name: "(2) FE",
      cmd: "areg price mpg weight, absorb(rep78)",
      n: 69,
      r2: 0.3684,
      coefs: [
        { var: "mpg", b: -57.3, se: 40.2, p: 0.21 },
        { var: "weight", b: 1.6, se: 0.5, p: 0.03 },
        { var: "_cons", b: 2000, se: 3000, p: 0.52 },
      ],
      status: "candidate",
    },
  ],
});

describe("QRegWorkbench", () => {
  it("renders models as columns with coefficients, stars, N and R²", () => {
    const { container } = render(<QRegWorkbench filename="t.qreg" text={text} />);
    const heads = [...container.querySelectorAll("th")].map((el) => el.textContent?.trim());
    expect(heads).toContain("(1) OLS");
    expect(heads).toContain("(2) FE");
    // weight in model 1: 1.747 with *** (p=0.008)
    expect(screen.getByText("1.747")).toBeInTheDocument();
    expect(screen.getAllByText("***").length).toBeGreaterThan(0);
    expect(screen.getByText("74")).toBeInTheDocument();
    expect(screen.getByText("0.293")).toBeInTheDocument();
  });

  it("adopting a model flips its column from candidate to adopted", () => {
    const { container } = render(<QRegWorkbench filename="t.qreg" text={text} />);
    expect(container.querySelectorAll('th[data-status="candidate"]')).toHaveLength(2);
    fireEvent.click(screen.getAllByText("Adopt")[0]);
    expect(container.querySelectorAll('th[data-status="candidate"]')).toHaveLength(1);
    expect(container.querySelectorAll('th[data-status="adopted"]')).toHaveLength(1);
  });

  it("rejecting a model removes its column", () => {
    const { container } = render(<QRegWorkbench filename="t.qreg" text={text} />);
    fireEvent.click(screen.getAllByText("Reject")[1]);
    expect(screen.queryAllByText("(2) FE")).toHaveLength(0);
    const heads = [...container.querySelectorAll("th")].map((el) => el.textContent?.trim());
    expect(heads).toContain("(1) OLS");
  });

  it("saves the adjudicated document and clears dirty", () => {
    const onSave = vi.fn();
    render(<QRegWorkbench filename="t.qreg" text={text} onSave={onSave} />);
    const save = screen.getByText("Save").closest("button")!;
    expect(save).toBeDisabled();
    fireEvent.click(screen.getAllByText("Adopt")[0]);
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledOnce();
    const saved = JSON.parse(onSave.mock.calls[0][0] as string);
    expect(saved.models[0].status).toBe("adopted");
    expect(saved.models[1].status).toBe("candidate");
    expect(save).toBeDisabled();
  });

  it("resyncs when a different file's text arrives", () => {
    const { rerender } = render(<QRegWorkbench filename="t.qreg" text={text} />);
    fireEvent.click(screen.getAllByText("Adopt")[0]);
    const other = JSON.stringify({
      models: [
        {
          name: "(A) other",
          cmd: "regress y x",
          n: 10,
          coefs: [{ var: "x", b: 1, se: 0.5, p: 0.04 }],
          status: "candidate",
        },
      ],
    });
    rerender(<QRegWorkbench filename="o.qreg" text={other} />);
    expect(screen.getAllByText("(A) other").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("(1) OLS")).toHaveLength(0);
  });

  it("shows a readable error on an invalid file", () => {
    render(<QRegWorkbench filename="bad.qreg" text="<xml/>" />);
    expect(screen.getByText(/Could not read/)).toBeInTheDocument();
  });
});
