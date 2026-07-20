import { useEffect, useRef, useState } from "react";
import { Download, FileDiff, Loader2, MoreHorizontal, X } from "lucide-react";
import type { ArtifactBlock, ThreadBlock } from "@fishes/shared";
import { getClient } from "@/lib/runtime";
import { exportSessionMarkdown } from "@/lib/sessionExport";
import { refToArtifactBlock } from "@/lib/artifacts";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * The session's "…" menu — export the transcript as local Markdown, and view
 * everything the agent changed in the workspace this session as a diff. Both
 * are read-only, local operations (no network).
 */
export function SessionMenuButton({
  sessionId,
  title,
  blocks,
  onOpenArtifact,
}: {
  sessionId: string;
  title: string;
  blocks: ThreadBlock[];
  onOpenArtifact?: (a: ArtifactBlock) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const exportMd = async () => {
    setOpen(false);
    try {
      const path = await exportSessionMarkdown(title, blocks);
      toast.success(t("Transcript saved"));
      if (onOpenArtifact) {
        onOpenArtifact({
          kind: "artifact",
          path,
          filename: path.split(/[\\/]/).pop() ?? "transcript.md",
          artifact: "report",
          tool: "run",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const showDiff = async () => {
    setOpen(false);
    setDiffLoading(true);
    try {
      const patch = await getClient()!.sessionDiff(sessionId);
      setDiff(patch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDiffLoading(false);
    }
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-52 rounded-card border border-border bg-surface p-1 shadow-pop"
        >
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-[14px] text-text hover:bg-surface-2"
            onClick={() => void exportMd()}
          >
            <Download size={15} className="text-muted" /> {t("Export transcript")}
          </button>
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-[14px] text-text hover:bg-surface-2"
            onClick={() => void showDiff()}
          >
            <FileDiff size={15} className="text-muted" /> {t("View changes")}
          </button>
        </div>
      )}
      <button
        aria-label={t("Session menu")}
        className="rounded-input p-1 text-muted hover:bg-surface-2 hover:text-text"
        onClick={() => setOpen((o) => !o)}
      >
        {diffLoading ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={15} />}
      </button>
      {diff !== null && (
        <DiffModal
          patch={diff}
          onClose={() => setDiff(null)}
          onOpenFile={(path) => onOpenArtifact?.(refToArtifactBlock(path))}
        />
      )}
    </div>
  );
}

/** A read-only unified-diff viewer: added lines green, removed red, file
 *  headers bold. Nothing is applied — it just shows what changed. */
function DiffModal({
  patch,
  onClose,
  onOpenFile,
}: {
  patch: string;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}) {
  const t = useT();
  const empty = !patch.trim();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-8"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-border px-5 py-3">
          <FileDiff size={16} className="text-muted" />
          <span className="font-serif text-[15px] text-text">{t("Changes this session")}</span>
          <div className="flex-1" />
          <button aria-label={t("Close")} className="text-muted hover:text-text" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {empty ? (
          <div className="px-5 py-10 text-center text-[14px] text-muted">
            {t("No files were changed in this session.")}
          </div>
        ) : (
          <pre className="min-h-0 flex-1 overflow-auto px-5 py-3 font-mono text-[12.5px] leading-6">
            {patch.split("\n").map((line, i) => {
              const cls = line.startsWith("+++") || line.startsWith("---")
                ? "font-semibold text-text"
                : line.startsWith("+")
                  ? "text-ok"
                  : line.startsWith("-")
                    ? "text-error"
                    : line.startsWith("@@")
                      ? "text-link"
                      : "text-muted";
              // A "+++ b/path" header line becomes a click-to-open affordance.
              const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
              if (fileMatch) {
                return (
                  <div
                    key={i}
                    className="cursor-pointer font-semibold text-text hover:underline"
                    onClick={() => onOpenFile(fileMatch[1])}
                  >
                    {line}
                  </div>
                );
              }
              return (
                <div key={i} className={cn("whitespace-pre-wrap break-all", cls)}>
                  {line || " "}
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}
