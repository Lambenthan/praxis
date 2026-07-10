import { useRef } from "react";
import { FileText, X } from "lucide-react";
import type { PdfInspector as PdfInspectorT } from "@ai4s/shared";
import { useScrollMemory } from "@/lib/scrollMemory";
import { reviewDocx } from "@/lib/reviewDocx";
import { saveBytesWithFeedback } from "@/lib/download";
import { PaneTitlebarInset } from "./RightPane";
import { useT } from "@/lib/i18n";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function PdfInspector({
  data,
  onClose,
  controls,
}: {
  data: PdfInspectorT;
  onClose: () => void;
  /** Pane-level header buttons (e.g. maximize), rendered before Close. */
  controls?: React.ReactNode;
}) {
  const t = useT();
  const { doc } = data;
  // Reading position, restored when this document is reopened.
  const scrollRef = useRef<HTMLDivElement>(null);
  const onScroll = useScrollMemory(scrollRef, `pdf:${data.title}`);
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <PaneTitlebarInset />
        <span className="text-sm font-medium text-text">{data.title}</span>
        <div className="flex-1" />
        {/* Export the compiled review as a journal-formatted Word document —
            the Word twin of this PDF, for journals that take .docx submissions. */}
        <button
          className="inline-flex items-center gap-1 rounded-input border border-border px-2 py-1 text-[11px] text-muted transition hover:bg-surface-2 hover:text-text"
          title={t("Export this review as a journal-formatted Word document")}
          onClick={() =>
            void reviewDocx(doc).then((bytes) =>
              saveBytesWithFeedback(
                `${data.title.replace(/\.pdf$/i, "") || "review"}.docx`,
                bytes,
                DOCX_MIME,
              ),
            )
          }
        >
          <FileText size={12} /> {t("Export Word")}
        </button>
        {controls}
        <button className="text-text hover:opacity-60" aria-label={t("Close inspector")} onClick={onClose}>
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto bg-surface-2 p-6">
        {/* Styled HTML facsimile of the compiled PDF (real pdf.js deferred). */}
        <article className="mx-auto max-w-[620px] rounded-sm bg-white px-10 py-10 font-serif text-[13px] leading-relaxed text-[#1a1a1a] shadow-card">
          <h1 className="text-center text-[19px] font-semibold leading-snug">{doc.title}</h1>
          {doc.subtitle && (
            <p className="mt-1 text-center text-[15px] italic">{doc.subtitle}</p>
          )}

          {doc.summaryTable && (
            <table className="mx-auto my-5 border-collapse text-[11px]">
              <thead>
                <tr className="border-y border-[#1a1a1a]">
                  {doc.summaryTable.columns.map((c) => (
                    <th key={c} className="px-2 py-1 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.summaryTable.rows.map((row, i) => (
                  <tr key={i} className="border-b border-[#1a1a1a]">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 text-center">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {doc.figure && (
            <figure className="my-5">
              <img src={doc.figure.src} alt={doc.figure.title} className="mx-auto max-w-[70%]" />
              <figcaption className="mt-2 text-[11px]">
                <span className="font-semibold">{doc.figure.title}: </span>
                {doc.figure.caption}
              </figcaption>
            </figure>
          )}

          {doc.sections.map((s) => (
            <section key={s.heading} className="mt-4">
              <h2 className="text-[14px] font-semibold">{s.heading}</h2>
              <p className="mt-1 text-justify">{s.body}</p>
            </section>
          ))}

          <div className="mt-8 text-center text-[11px] text-[#888]">1</div>
        </article>
      </div>
    </div>
  );
}
