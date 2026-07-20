import { useEffect, useState } from "react";
import { Loader2, Paperclip, Undo2 } from "lucide-react";
import type {
  ArtifactBlock,
  DataTableBlock,
  RunningJobsBlock,
  StatusLineBlock,
  UserMessageBlock,
} from "@fishes/shared";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { useRuntimeStore } from "@/lib/runtime";
import { useThrottledValue } from "@/lib/useThrottledValue";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MarkdownViewer } from "@/components/markdown-viewer/MarkdownViewer";
import { extractArtifactRefs, refToArtifactBlock } from "@/lib/artifacts";
import { resolveArtifactPath } from "@/lib/artifactFile";

export function UserMessage({ block }: { block: UserMessageBlock }) {
  // Handoff: user turns are a right-aligned bubble, not a full-width card.
  return (
    <div className="flex justify-end">
      <div
        data-user-message
        className="max-w-[75%] whitespace-pre-wrap break-words rounded-bubble bg-bg-300 px-3.5 py-[9px] text-[15px] leading-[1.6] text-text-000"
      >
        {block.text}
      </div>
    </div>
  );
}

export function AgentMessage({
  markdown,
  onOpenArtifact,
}: {
  markdown: string;
  onOpenArtifact?: (a: ArtifactBlock) => void;
}) {
  // While a reply streams, `markdown` changes on every token — and re-parsing
  // the WHOLE growing text each time (remark + remark-gfm + KaTeX) is O(n²)
  // across the turn. Parse a throttled copy instead: the visible text catches
  // up a few times per second, and the trailing update guarantees the final
  // text always lands. Settled messages never change, so this is a no-op for
  // history.
  const display = useThrottledValue(markdown, 150);
  // Files the agent mentions (e.g. a PDF produced by running code) become clickable.
  // Each mention is resolved to a real workspace path first — prose often names a
  // bare filename ("index.html") whose file lives in a subdirectory; mentions of
  // files that don't exist get no chip.
  const mentioned = onOpenArtifact ? extractArtifactRefs(display) : [];
  const [refs, setRefs] = useState<string[]>([]);
  const mentionedKey = mentioned.join("\n");
  useEffect(() => {
    let cancelled = false;
    if (!mentionedKey) {
      setRefs([]);
      return;
    }
    void Promise.all(mentionedKey.split("\n").map((p) => resolveArtifactPath(p).catch(() => null))).then(
      (resolved) => {
        if (cancelled) return;
        setRefs([...new Set(resolved.filter((p): p is string => p !== null))]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mentionedKey]);
  return (
    <div>
      <MarkdownViewer>{display}</MarkdownViewer>
      {refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {refs.map((path) => (
            <button
              key={path}
              onClick={() => onOpenArtifact?.(refToArtifactBlock(path))}
              className="flex items-center gap-1.5 rounded-input border border-border bg-surface px-2 py-1 text-xs text-text hover:bg-surface-2"
              title={`Preview ${path}`}
            >
              <Paperclip size={12} className="text-accent" />
              <span className="font-mono">{path.split(/[\\/]/).pop()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DataTable({ block }: { block: DataTableBlock }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
      {block.caption && (
        <div className="border-b border-border px-4 py-2 text-xs text-muted">{block.caption}</div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {block.columns.map((c) => (
              <th key={c} className="px-4 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "px-4 py-2 text-text",
                    j === row.length - 1 && "font-mono text-[14px] text-link",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RunningJobsOverlay({ block }: { block: RunningJobsBlock }) {
  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted">
        {block.title}
      </div>
      <ul className="divide-y divide-border/60">
        {block.jobs.map((j, i) => (
          <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
            <Loader2 size={13} className="animate-spin text-accent" />
            <span className="flex-1 truncate text-text">{j.label}</span>
            <span className="text-xs text-muted">{j.elapsed}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TONE: Record<NonNullable<StatusLineBlock["tone"]>, string> = {
  running: "text-accent",
  done: "text-ok",
  review: "text-muted",
  error: "text-error",
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function StatusLine({ block }: { block: StatusLineBlock }) {
  const t = useT();
  // The Undo confirmation goes through the in-app ConfirmDialog — window.confirm
  // is a no-op inside the desktop webview (Tauri doesn't wire the native panel),
  // which made the Undo button silently do nothing when clicked.
  const [confirmUndo, setConfirmUndo] = useState(false);
  // A usage footer: faint, right-aligned, tokens + optional USD cost — the
  // per-turn "what did this cost" a researcher watches.
  if (block.usage) {
    const messageId = block.usage.messageId;
    return (
      <div className="group/footer flex items-center justify-end gap-3 pr-1 text-[12px] tabular-nums text-muted/70">
        {messageId && (
          <button
            onClick={() => setConfirmUndo(true)}
            className="flex items-center gap-1 rounded-input px-1.5 py-0.5 text-muted/60 opacity-0 transition group-hover/footer:opacity-100 hover:bg-surface-2 hover:text-text"
            title={t("Undo this turn")}
          >
            <Undo2 size={12} /> {t("Undo")}
          </button>
        )}
        {confirmUndo && messageId && (
          <ConfirmDialog
            title={t("Undo this turn")}
            body={t("Undo this turn? The reply and everything after it is removed.")}
            confirmLabel={t("Undo")}
            onConfirm={() => {
              setConfirmUndo(false);
              void useRuntimeStore.getState().revertTo(messageId);
            }}
            onCancel={() => setConfirmUndo(false)}
          />
        )}
        <span>
          {fmtTokens(block.usage.tokens)} {t("tokens")}
        </span>
        {typeof block.usage.cost === "number" && block.usage.cost > 0 && (
          <span>${block.usage.cost.toFixed(block.usage.cost < 0.01 ? 4 : 3)}</span>
        )}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2 text-sm", TONE[block.tone ?? "review"])}>
      <Loader2
        size={14}
        className={cn(block.tone === "running" && "animate-spin", block.tone !== "running" && "hidden")}
      />
      <span>{block.text}</span>
    </div>
  );
}
