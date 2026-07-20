import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/cn";

/** Three contexts render markdown: chat bubbles (theme colors, compact), the
 *  file-preview "paper" (document-neutral black-on-white, editorial scale —
 *  like the Office previews, a document keeps its own colors in dark mode),
 *  and in-product cards (wiki panel: app tokens, pane-scale sans). */
type Variant = "chat" | "document" | "card";

const STYLES: Record<Variant, Record<string, string>> = {
  // cds assistant prose (measured on live Claude Science): 15px / 1.625
  // near-black (#0b0b0b); bold is 600; inline code is blue (--text-accent) on a
  // faint blue wash (--bg-accent), 12px; ordered/unordered lists indent 24px.
  chat: {
    root: "text-[15px] leading-[1.625] text-text-000 [&_strong]:font-semibold",
    p: "my-3 first:mt-0 last:mb-0 [text-wrap:pretty] [overflow-wrap:break-word]",
    a: "text-accent underline underline-offset-2 hover:opacity-80",
    code: "rounded-[5px] bg-accent/10 px-[5px] py-px font-mono text-[13px] text-accent",
    pre: "my-3 overflow-x-auto rounded-code bg-code-bg p-4 font-mono text-[12.5px] leading-[1.75] text-text-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-text-100",
    ul: "my-3 list-disc space-y-1 pl-6",
    ol: "my-3 list-decimal space-y-1 pl-6",
    h1: "mb-3 mt-5 text-[20px] font-semibold leading-snug first:mt-0",
    h2: "mb-2 mt-5 text-[17px] font-semibold leading-snug first:mt-0",
    h3: "mb-2 mt-4 text-[15px] font-semibold leading-snug first:mt-0",
    h4: "mb-2 mt-3 text-[14px] font-semibold leading-snug first:mt-0",
    blockquote: "my-3 border-l-2 border-border pl-3 text-text-200",
    hr: "my-4 border-border",
    table: "border-collapse text-[14px]",
    th: "border border-border bg-bg-200 px-3 py-1.5 text-left font-semibold",
    td: "border border-border px-3 py-1.5",
  },
  // Editorial-blog paper: warm ink on white, serif headings, terracotta accent
  // (#c06a3e — the app's brand). Theme-independent by design: a document reads
  // the same in light or dark mode, so colors are fixed, not tokens.
  //
  // Two font stacks, both explicit so the paper never inherits the app's UI
  // font. Body: a comfortable reading sans (SF/Segoe + PingFang for Chinese).
  // Headings: the finest reading serifs that actually ship on macOS/Windows
  // (Iowan/Charter → Georgia), CJK falling back to Songti.
  document: {
    root: "text-[16px] leading-[1.8] text-[#2b2620] antialiased [font-feature-settings:'liga','kern'] [font-family:-apple-system,'SF_Pro_Text','Segoe_UI','PingFang_SC','Microsoft_YaHei',sans-serif] selection:bg-[#f2d9cd]",
    p: "my-4 tracking-[0.006em] [text-wrap:pretty] first:mt-0 last:mb-0",
    a: "font-medium text-[#bf5a34] underline decoration-[#e2bdac] decoration-1 underline-offset-[3px] transition-colors hover:decoration-[#bf5a34]",
    code: "rounded-[4px] bg-[#f7f0ea] px-1.5 py-0.5 font-mono text-[14px] text-[#a94e2c] ring-1 ring-[#eee0d6]",
    pre: "my-5 overflow-x-auto rounded-lg bg-[#faf6f2] p-4 font-mono text-[14px] leading-6 ring-1 ring-[#ece2d9] [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[#4b433a] [&_code]:ring-0",
    ul: "my-4 ml-[1.15em] list-disc space-y-2 marker:text-[#c98a6b]",
    ol: "my-4 ml-[1.15em] list-decimal space-y-2 marker:text-[14px] marker:font-medium marker:text-[#c98a6b]",
    // Serif display headings give the editorial/blog feel; the stack falls back
    // to system CJK serif so Chinese posts read as editorial too. Tracking stays
    // near-zero — negative tracking crams CJK glyphs.
    h1: "mb-3 mt-10 text-[33px] font-bold leading-[1.25] tracking-[-0.01em] text-[#1c1915] [text-wrap:balance] first:mt-0 [font-family:'Newsreader','Iowan_Old_Style','Charter',Georgia,'Songti_SC','Noto_Serif_CJK_SC',serif]",
    h2: "mb-4 mt-11 flex items-baseline gap-2.5 text-[23px] font-semibold leading-snug tracking-[-0.005em] text-[#1c1915] [text-wrap:balance] before:relative before:top-[0.14em] before:h-[0.82em] before:w-[3px] before:shrink-0 before:rounded-full before:bg-[#c06a3e] before:content-[''] first:mt-0 [font-family:'Newsreader','Iowan_Old_Style','Charter',Georgia,'Songti_SC','Noto_Serif_CJK_SC',serif]",
    h3: "mb-2 mt-8 text-[18.5px] font-semibold leading-snug text-[#2b2620] first:mt-0 [font-family:'Newsreader','Iowan_Old_Style','Charter',Georgia,'Songti_SC','Noto_Serif_CJK_SC',serif]",
    h4: "mb-2 mt-6 text-[14px] font-semibold uppercase tracking-[0.08em] text-[#9a8d7c] first:mt-0",
    blockquote: "my-5 rounded-r-md border-l-[3px] border-[#d98c6a] bg-[#faf6f2] py-1.5 pl-5 pr-4 text-[#6b6155] [&_p]:my-1.5",
    hr: "mx-auto my-10 w-12 border-t-2 border-[#e6ddd2]",
    table: "border-collapse text-[14px] tabular-nums",
    th: "border-b-2 border-[#e2d5c8] px-4 py-2.5 text-left font-semibold text-[#1c1915]",
    td: "border-b border-[#efe8df] px-4 py-2.5",
  },
  // In-product card (the wiki panel): the app's own voice, not the editorial
  // paper — sans headings on text tokens at pane scale, theme-aware. The h2
  // keeps the document variant's accent bar, re-pointed to the app accent
  // (one accent), so section starts still read at a glance.
  card: {
    root: "text-[13.5px] leading-[1.7] text-text-100 [&_strong]:font-semibold",
    p: "my-3 [text-wrap:pretty] [overflow-wrap:break-word] first:mt-0 last:mb-0",
    a: "text-accent underline underline-offset-2 hover:opacity-80",
    code: "rounded-[5px] bg-accent/10 px-[5px] py-px font-mono text-[12px] text-accent",
    pre: "my-3 overflow-x-auto rounded-code bg-code-bg p-3 font-mono text-[12px] leading-[1.7] text-text-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-text-100",
    ul: "my-3 list-disc space-y-1 pl-5",
    ol: "my-3 list-decimal space-y-1 pl-5",
    h1: "mb-2 mt-5 text-[16px] font-semibold leading-snug text-text-000 first:mt-0",
    h2: "mb-2 mt-5 flex items-baseline gap-2 text-[14px] font-semibold leading-snug text-text-000 before:relative before:top-[0.12em] before:h-[0.85em] before:w-[3px] before:shrink-0 before:rounded-full before:bg-accent before:content-[''] first:mt-0",
    h3: "mb-1.5 mt-4 text-[13.5px] font-semibold leading-snug text-text-000 first:mt-0",
    h4: "mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-300 first:mt-0",
    blockquote: "my-3 border-l-2 border-border pl-3 text-text-200",
    hr: "my-4 border-border",
    table: "border-collapse text-[12.5px] tabular-nums",
    th: "border border-border bg-bg-200 px-3 py-1.5 text-left font-semibold",
    td: "border border-border px-3 py-1.5",
  },
};

// Memoized: parsing is the expensive part (remark + remark-gfm + KaTeX), and
// every prop is a plain string — a parent re-render with the same text must
// not re-parse the whole document.
export const MarkdownViewer = memo(function MarkdownViewer({
  children,
  className,
  variant = "chat",
}: {
  children: string;
  className?: string;
  variant?: Variant;
}) {
  const s = STYLES[variant];
  return (
    <div className={cn(s.root, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className={s.p}>{children}</p>,
          a: ({ children, href }) => (
            <a href={href} className={s.a}>
              {children}
            </a>
          ),
          code: ({ children }) => <code className={s.code}>{children}</code>,
          // Block code: the plain wrapper — its inner <code> is restyled via [&_code].
          pre: ({ children }) => <pre className={s.pre}>{children}</pre>,
          ul: ({ children }) => <ul className={s.ul}>{children}</ul>,
          ol: ({ children }) => <ol className={s.ol}>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          // Document elements (headings, quotes, tables, rules) — Tailwind's
          // preflight strips the browser defaults, so each needs explicit style.
          h1: ({ children }) => <h1 className={s.h1}>{children}</h1>,
          h2: ({ children }) => <h2 className={s.h2}>{children}</h2>,
          h3: ({ children }) => <h3 className={s.h3}>{children}</h3>,
          h4: ({ children }) => <h4 className={s.h4}>{children}</h4>,
          blockquote: ({ children }) => <blockquote className={s.blockquote}>{children}</blockquote>,
          hr: () => <hr className={s.hr} />,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className={s.table}>{children}</table>
            </div>
          ),
          th: ({ children }) => <th className={s.th}>{children}</th>,
          td: ({ children }) => <td className={s.td}>{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
