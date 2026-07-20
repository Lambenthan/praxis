import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CellOutput, isErrorText, sanitizeHtml } from "./notebookOutput";

describe("sanitizeHtml", () => {
  it("keeps allow-listed table markup", () => {
    const out = sanitizeHtml(
      '<table border="1" class="dataframe"><thead><tr><th>a</th></tr></thead>' +
        "<tbody><tr><td>1</td></tr></tbody></table>",
    );
    expect(out).toContain("<table>"); // border/class stripped, tag kept
    expect(out).toContain("<th>a</th>");
    expect(out).toContain("<td>1</td>");
  });

  it("strips <script>, <style>, and on* handlers", () => {
    const out = sanitizeHtml(
      '<div onclick="steal()"><style>body{}</style><script>evil()</script>ok</div>',
    );
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<style");
    expect(out).not.toContain("onclick");
    expect(out).toContain("ok");
  });

  it("drops javascript: links but keeps safe ones with noopener", () => {
    expect(sanitizeHtml('<a href="javascript:evil()">x</a>')).not.toContain("javascript:");
    const safe = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(safe).toContain('href="https://example.com"');
    expect(safe).toContain('rel="noopener noreferrer"');
  });
});

describe("isErrorText", () => {
  it("flags tracebacks and the app's own error strings", () => {
    expect(isErrorText("Traceback (most recent call last)\n  ...")).toBe(true);
    expect(isErrorText("ZeroDivisionError: division by zero")).toBe(true);
    expect(isErrorText("kernel error: boom")).toBe(true);
    expect(isErrorText("Interrupted — the kernel was restarted")).toBe(true);
    expect(isErrorText("hello\n2")).toBe(false);
  });
});

describe("CellOutput", () => {
  it("renders sanitized HTML as a real table", () => {
    const { container } = render(
      <CellOutput html="<table><tr><td>42</td></tr></table>" />,
    );
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.textContent).toBe("42");
  });

  it("applies the danger palette to error output", () => {
    const { container } = render(<CellOutput output="NameError: x is not defined" />);
    const pre = container.querySelector("pre");
    expect(pre?.className).toContain("text-error");
  });
});
