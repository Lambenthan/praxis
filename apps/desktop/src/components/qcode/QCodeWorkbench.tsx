import { useEffect, useMemo, useState } from "react";
import { FileText, Save, ShieldCheck, Table } from "lucide-react";
import type { QCodeDoc } from "@/lib/qcode";
import {
  adoptAnnotation,
  codebookCsv,
  excerptsCsv,
  parseQCode,
  rejectAnnotation,
  serializeQCode,
} from "@/lib/qcode";
import { saveTextWithFeedback } from "@/lib/download";
import { Codebook } from "./Codebook";
import { SourcePane } from "./SourcePane";
import { AdjudicationQueue } from "./AdjudicationQueue";
import { useT } from "@/lib/i18n";

// UTF-8 byte-order mark: prepended to CSV exports so Excel reads CJK correctly.
const BOM = String.fromCharCode(0xfeff);

/** Interactive qualitative-coding workbench: AI candidates in the right-hand
 *  queue, the human adopts/rejects each one, and the source highlight flips
 *  from dashed candidate to solid adopted. `onSave` receives the serialized
 *  .qcode when provided (the caller decides how to persist). */
export function QCodeWorkbench({
  filename,
  text,
  onSave,
}: {
  filename: string;
  text: string;
  onSave?: (text: string) => void;
}) {
  const t = useT();
  const initial = useMemo<QCodeDoc | null>(() => {
    try {
      const p = parseQCode(text);
      return { sources: p.sources, codes: p.codes, annotations: p.annotations };
    } catch {
      return null;
    }
  }, [text]);

  const [doc, setDoc] = useState<QCodeDoc | null>(initial);
  const [active, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  // Resync when a different .qcode is opened without remounting: reload the doc
  // and drop all view/decision state so an unsaved adjudication can never leak
  // from the previous file into the new one.
  useEffect(() => {
    try {
      const p = parseQCode(text);
      setDoc({ sources: p.sources, codes: p.codes, annotations: p.annotations });
    } catch {
      setDoc(null);
    }
    setActive(null);
    setFocused(null);
    setDirty(false);
  }, [text]);

  if (!doc) {
    return (
      <div className="p-6 text-sm text-muted">
        {t("Could not read this coding file —")} {filename}.
      </div>
    );
  }

  const adopt = (i: number) => {
    setDoc((d) => (d ? adoptAnnotation(d, i) : d));
    setDirty(true);
  };
  const reject = (i: number) => {
    setDoc((d) => (d ? rejectAnnotation(d, i) : d));
    setFocused(null);
    setDirty(true);
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">{filename}</span>
        <span className="inline-flex items-center gap-1 text-[12px] text-ok">
          <ShieldCheck size={13} /> {t("quotes are exact source spans")}
        </span>
        {/* Take the adjudicated result out of the workbench: a codebook (codes +
            counts) and the adopted excerpts, both CSV so they open in Excel — the
            qualitative twin of the .qreg table exports. BOM so Excel reads CJK. */}
        {(() => {
          const base = filename.replace(/\.qcode$/i, "") || "codes";
          const btn =
            "inline-flex items-center gap-1 rounded-input border border-border px-2 py-1 text-[12px] text-muted transition hover:bg-surface-2 hover:text-text";
          return (
            <>
              <button
                className={btn}
                title={t("Export the codebook (codes + counts) as CSV")}
                onClick={() =>
                  void saveTextWithFeedback(`${base}-codebook.csv`, BOM + codebookCsv(doc), "text/csv")
                }
              >
                <Table size={12} /> {t("Codebook")}
              </button>
              <button
                className={btn}
                title={t("Export the adopted coded excerpts (quote + code) as CSV")}
                onClick={() =>
                  void saveTextWithFeedback(`${base}-excerpts.csv`, BOM + excerptsCsv(doc), "text/csv")
                }
              >
                <FileText size={12} /> {t("Excerpts")}
              </button>
            </>
          );
        })()}
        {onSave && (
          <button
            disabled={!dirty}
            onClick={() => {
              onSave(serializeQCode(doc));
              setDirty(false);
            }}
            className="inline-flex items-center gap-1 rounded-input bg-accent px-2.5 py-1 text-[12px] font-medium text-accent-fg transition enabled:hover:brightness-105 enabled:active:scale-[0.97] disabled:opacity-40"
          >
            <Save size={12} /> {t("Save")}
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <Codebook doc={doc} active={active} onToggle={setActive} />
        <SourcePane doc={doc} active={active} focused={focused} />
        <AdjudicationQueue
          doc={doc}
          focused={focused}
          onFocus={setFocused}
          onAdopt={adopt}
          onReject={reject}
        />
      </div>
    </div>
  );
}
