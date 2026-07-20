import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, FileCode2, FileText, Save, Table } from "lucide-react";
import type { QRegDoc } from "@/lib/qreg";
import {
  adoptModel,
  coefFor,
  doFile,
  docxTable,
  fmtNum,
  num,
  latexTable,
  modelStatus,
  parseQReg,
  rejectModel,
  serializeQReg,
  shortModelName,
  stars,
  varOrder,
} from "@/lib/qreg";
import { cn } from "@/lib/cn";
import { saveBytesWithFeedback, saveTextWithFeedback } from "@/lib/download";
import { useT } from "@/lib/i18n";

/**
 * Regression adjudication workbench — the quantitative twin of the .qcode
 * workbench, same constitution: the agent's models arrive as dashed
 * candidates, the human adopts the ones that make the final table (solid) or
 * rejects them out of the document. Composed as a journal table on a centered
 * paper sheet: three rules, coefficient with stars, standard error beneath in
 * parentheses, candidate columns washed until adjudicated.
 */
export function QRegWorkbench({
  filename,
  text,
  onSave,
}: {
  filename: string;
  text: string;
  onSave?: (text: string) => void;
}) {
  const t = useT();
  const initial = useMemo<QRegDoc | null>(() => {
    try {
      return parseQReg(text);
    } catch {
      return null;
    }
  }, [text]);

  const [doc, setDoc] = useState<QRegDoc | null>(initial);
  const [dirty, setDirty] = useState(false);

  // Resync when a different .qreg is opened without remounting (same guard as
  // the qcode workbench): reload and drop unsaved decisions.
  useEffect(() => {
    try {
      setDoc(parseQReg(text));
    } catch {
      setDoc(null);
    }
    setDirty(false);
  }, [text]);

  // When more model columns sit off the right edge, fade them and show a "›" so
  // the reader knows models (5), (6)… exist beyond what fits. These hooks MUST
  // sit above the early return below: when doc flips to null (switching to an
  // unreadable .qreg in place, no remount) the hook count must stay stable, or
  // React throws "rendered fewer hooks than expected".
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const syncEdge = () => {
    const el = scrollRef.current;
    if (el) setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useEffect(() => {
    syncEdge();
    window.addEventListener("resize", syncEdge);
    return () => window.removeEventListener("resize", syncEdge);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  if (!doc) {
    return (
      <div className="p-6 text-sm text-muted">
        {t("Could not read this results file —")} {filename}.
      </div>
    );
  }

  const adopt = (i: number) => {
    setDoc((d) => (d ? adoptModel(d, i) : d));
    setDirty(true);
  };
  const reject = (i: number) => {
    setDoc((d) => (d ? rejectModel(d, i) : d));
    setDirty(true);
  };

  const vars = varOrder(doc);
  const pending = doc.models.filter((m) => modelStatus(m) === "candidate").length;
  const candidateCol = doc.models.map((m) => modelStatus(m) === "candidate");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">{filename}</span>
        <span className="text-[12px] text-muted">
          {t("Models:")} {doc.models.length}
          {pending > 0
            ? ` · ${pending} ${t("to adjudicate")}`
            : ` · ${t("all adjudicated")}`}
        </span>
        {/* Export the adjudicated table into a paper: an esttab-style booktabs
            .tex, and a reproduction .do of the same models. */}
        {(() => {
          const base = filename.replace(/\.qreg$/i, "") || "results";
          const btn =
            "inline-flex items-center gap-1 rounded-input border border-border px-2 py-1 text-[12px] text-muted transition hover:bg-surface-2 hover:text-text";
          return (
            <>
              <button
                className={btn}
                title={t("Export the three-line table as LaTeX (booktabs)")}
                onClick={() =>
                  void saveTextWithFeedback(`${base}.tex`, latexTable(doc), "text/x-tex")
                }
              >
                <Table size={12} /> {t("LaTeX")}
              </button>
              <button
                className={btn}
                title={t("Export the three-line table as Word (.docx)")}
                onClick={() =>
                  void docxTable(doc).then((bytes) =>
                    saveBytesWithFeedback(
                      `${base}.docx`,
                      bytes,
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ),
                  )
                }
              >
                <FileText size={12} /> {t("Word")}
              </button>
              <button
                className={btn}
                title={t("Export a reproduction do-file of these models")}
                onClick={() =>
                  void saveTextWithFeedback(`${base}.do`, doFile(doc, filename), "text/plain")
                }
              >
                <FileCode2 size={12} /> {t("do-file")}
              </button>
            </>
          );
        })()}
        {onSave && (
          <button
            disabled={!dirty}
            onClick={() => {
              onSave(serializeQReg(doc));
              setDirty(false);
            }}
            className="inline-flex items-center gap-1 rounded-input bg-accent px-2.5 py-1 text-[12px] font-medium text-accent-fg transition enabled:hover:brightness-105 enabled:active:scale-[0.97] disabled:opacity-40"
          >
            <Save size={12} /> {t("Save")}
          </button>
        )}
      </div>

      {/* Winnowing progress, the same signature as the qcode queue: how many of
          the candidate models the researcher has ruled into the table. The
          deliberate human pass is the product's core, so it reads as a quiet
          meter in the brand accent under the header. */}
      {doc.models.length > 0 && (
        <div
          className="h-[2px] shrink-0 bg-surface-2"
          title={`${doc.models.length - pending}/${doc.models.length} ${t("adopted")}`}
        >
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${((doc.models.length - pending) / doc.models.length) * 100}%` }}
          />
        </div>
      )}

      {/* The results sit on one clean white page (not a card floating on the
          tinted app background) — the table reads as the journal page it is
          headed for. Centered with generous margins, it fills the sheet rather
          than shrinking to a small block. */}
      <div className="min-h-0 flex-1 overflow-auto bg-surface">
        <div className="mx-auto max-w-3xl px-10 py-12">
          <div className="w-full">
            {doc.title && (
              <div className="text-center font-serif text-[22px] font-semibold tracking-[0.01em] text-text [text-wrap:balance]">
                {doc.title}
              </div>
            )}
            {doc.depvar && (
              <div className="mt-2 text-center font-serif text-[16px] italic text-muted">
                {t("Dependent variable:")}{" "}
                <span className="not-italic text-text">{doc.depvar}</span>
              </div>
            )}

            {/* Wide tables (many models) scroll horizontally inside the sheet;
                the variable-name column stays pinned so a row is never anonymous,
                and a right-edge fade signals the models that don't fit. */}
            <div className="relative mt-6">
            <div ref={scrollRef} onScroll={syncEdge} className="overflow-x-auto">
            <table
              className="mx-auto border-collapse font-serif text-[14px]"
              data-testid="qreg-table"
            >
              <thead>
                <tr className="border-t-[1.5px] border-text">
                  <th className="sticky left-0 z-20 bg-surface py-2.5 pl-1 pr-10"> </th>
                  {doc.models.map((m, i) => {
                    // Journal columns are terse: a model named "(1) 简约基准: mpg +
                    // weight + foreign" shows "(1) 简约基准" as the head and the spec
                    // as a small, truncated hint — the full spec lives in the notes.
                    const ci = m.name.indexOf(":");
                    const head = shortModelName(m.name);
                    const sub = ci >= 0 ? m.name.slice(ci + 1).trim() : "";
                    return (
                      <th
                        key={i}
                        data-status={candidateCol[i] ? "candidate" : "adopted"}
                        className="min-w-[124px] px-6 pb-1.5 pt-3 text-center align-bottom font-medium text-text"
                      >
                        <div className="text-[15px] leading-tight">{head}</div>
                        {sub && (
                          <div
                            className="mx-auto mt-1 max-w-[148px] truncate text-[12px] font-normal text-muted/70"
                            title={sub}
                          >
                            {sub}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
                {pending > 0 && (
                  <tr>
                    <td className="sticky left-0 z-20 bg-surface pb-3"> </td>
                    {doc.models.map((_, i) => (
                      <td key={i} className="px-6 pb-3 pt-1">
                        {candidateCol[i] ? (
                          // The one piece of UI inside the typeset table, so it
                          // declares itself as a control: a small segmented pill,
                          // colour only on hover.
                          <div className="mx-auto flex w-max items-center overflow-hidden whitespace-nowrap rounded-full border border-border font-sans text-[13px] leading-none">
                            <button
                              onClick={() => adopt(i)}
                              className="px-2.5 py-[5px] text-muted transition-colors hover:bg-ok/10 hover:text-ok"
                            >
                              {t("Adopt")}
                            </button>
                            <span className="h-3.5 w-px bg-border" />
                            <button
                              onClick={() => reject(i)}
                              className="px-2.5 py-[5px] text-muted transition-colors hover:bg-error/10 hover:text-error"
                            >
                              {t("Reject")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1 whitespace-nowrap font-sans text-[13px] text-ok/90">
                            <Check size={13} /> {t("Adopted")}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody className="border-t border-text">
                {vars.map((v, r) => (
                  <tr key={v}>
                    <td
                      className={cn(
                        "sticky left-0 z-10 bg-surface py-[5px] pl-1 pr-10 align-top text-[16px] text-text",
                        r === 0 && "pt-3.5",
                      )}
                    >
                      {v === "_cons" ? t("Constant") : v}
                    </td>
                    {doc.models.map((m, i) => {
                      const c = coefFor(m, v);
                      return (
                        <td
                          key={i}
                          className={cn(
                            // Candidate columns sit washed until the human rules
                            // on them — adopting a model inks its numbers, the
                            // same dashed-to-solid move as the coding queue.
                            "px-6 py-[5px] text-center align-top tabular-nums text-text transition-opacity duration-300",
                            r === 0 && "pt-3.5",
                            candidateCol[i] && "opacity-60",
                          )}
                        >
                          {c ? (
                            <>
                              <div className="text-[16px]">
                                {fmtNum(c.b)}
                                <span className="align-super text-[10px]">{stars(c.p)}</span>
                              </div>
                              <div className="text-[13px] text-muted">({fmtNum(c.se)})</div>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-surface pb-[3px] pl-1 pr-10 pt-2 text-[15px] text-text">
                    N
                  </td>
                  {doc.models.map((m, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-6 pb-[3px] pt-2 text-center text-[15px] tabular-nums text-text transition-opacity duration-300",
                        candidateCol[i] && "opacity-60",
                      )}
                    >
                      {num(m.n) != null ? num(m.n) : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b-[1.5px] border-text">
                  <td className="sticky left-0 z-10 bg-surface pb-2 pl-1 pr-10 pt-[3px] text-[15px] text-text">
                    R²
                  </td>
                  {doc.models.map((m, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-6 pb-2 pt-[3px] text-center text-[15px] tabular-nums text-text transition-opacity duration-300",
                        candidateCol[i] && "opacity-60",
                      )}
                    >
                      {num(m.r2) != null ? num(m.r2)!.toFixed(3) : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            </div>
            {moreRight && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end bg-gradient-to-l from-surface via-surface/85 to-transparent pr-0.5"
              >
                <ChevronRight size={18} className="animate-pulse text-muted" />
              </div>
            )}
            </div>

            <div className="mt-4 text-center font-serif text-[13px] leading-relaxed text-muted">
              {t("Standard errors in parentheses.")} * p&lt;0.1, ** p&lt;0.05, *** p&lt;0.01
            </div>

            <details className="mt-8">
              <summary className="cursor-pointer select-none text-[12px] text-muted transition-colors hover:text-text">
                {t("Model commands (do-file provenance)")}
              </summary>
              <div className="mt-2 space-y-1 rounded-input bg-surface-2 px-3 py-2">
                {doc.models.map((m, i) => (
                  <div key={i} className="font-mono text-[11px] leading-relaxed text-muted">
                    <span className="text-text">{m.name}</span> · {m.cmd}
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
