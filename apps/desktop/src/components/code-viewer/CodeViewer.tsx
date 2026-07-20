import { useMemo } from "react";
import hljs from "highlight.js/lib/common";
import latex from "highlight.js/lib/languages/latex";
import julia from "highlight.js/lib/languages/julia";
import "./hljs-theme.css";

// `highlight.js/lib/common` is a trimmed bundle for bundle size — it omits
// LaTeX and Julia, both languages this app's artifacts regularly produce
// (.tex reports, .jl scripts). Register them once at module load.
if (!hljs.getLanguage("latex")) hljs.registerLanguage("latex", latex);
if (!hljs.getLanguage("julia")) hljs.registerLanguage("julia", julia);

interface Props {
  code: string;
  language?: string;
  startLine?: number;
}

/**
 * Read-only code with a line-number gutter, wrapped like an IDE (no
 * horizontal scroll for long lines). Each line is its own flex row —
 * highlighting per line, rather than highlighting the whole file once and
 * splitting the resulting HTML by "\n", keeps every wrapped line's number
 * aligned with its own content regardless of how many visual rows it wraps
 * into. The language is resolved once for the whole file (falling back to
 * auto-detection) so per-line highlighting stays consistent instead of
 * re-guessing — and flickering between different guesses — line by line.
 */
export function CodeViewer({ code, language, startLine = 1 }: Props) {
  const lines = useMemo(() => code.replace(/\n$/, "").split("\n"), [code]);

  const resolvedLanguage = useMemo(() => {
    if (language && hljs.getLanguage(language)) return language;
    try {
      return hljs.highlightAuto(code).language;
    } catch {
      return undefined;
    }
  }, [code, language]);

  const highlightedLines = useMemo(
    () =>
      lines.map((line) => {
        try {
          return resolvedLanguage
            ? hljs.highlight(line, { language: resolvedLanguage, ignoreIllegals: true }).value
            : escapeHtml(line);
        } catch {
          return escapeHtml(line);
        }
      }),
    [lines, resolvedLanguage],
  );

  return (
    <div className="overflow-hidden rounded-input border border-border bg-surface font-mono text-[14px] leading-[1.55]">
      {highlightedLines.map((html, i) => (
        <div key={i} className="flex">
          <span
            aria-hidden
            className="w-11 shrink-0 select-none py-0.5 pr-3 text-right text-[13px] tabular-nums text-text-400"
          >
            {startLine + i}
          </span>
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words px-4 py-0.5">
            <code
              className="hljs bg-transparent"
              dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
            />
          </pre>
        </div>
      ))}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
