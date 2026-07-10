import { useEffect, useMemo, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import type { QCodeDoc } from "@/lib/qcode";
import { adoptAnnotation, parseQCode, rejectAnnotation, serializeQCode } from "@/lib/qcode";
import { Codebook } from "./Codebook";
import { SourcePane } from "./SourcePane";
import { AdjudicationQueue } from "./AdjudicationQueue";
import { useT } from "@/lib/i18n";

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
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">{filename}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-ok">
          <ShieldCheck size={13} /> {t("quotes are exact source spans")}
        </span>
        {onSave && (
          <button
            disabled={!dirty}
            onClick={() => {
              onSave(serializeQCode(doc));
              setDirty(false);
            }}
            className="inline-flex items-center gap-1 rounded-input bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg transition enabled:hover:brightness-105 enabled:active:scale-[0.97] disabled:opacity-40"
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
