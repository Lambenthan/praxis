import { useEffect, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import type {
  ArtifactBlock,
  DataTableBlock,
  RunningJobsBlock,
  StatusLineBlock,
  UserMessageBlock,
} from "@ai4s/shared";
import { cn } from "@/lib/cn";
import { MarkdownViewer } from "@/components/markdown-viewer/MarkdownViewer";
import { extractArtifactRefs, refToArtifactBlock } from "@/lib/artifacts";
import { resolveArtifactPath } from "@/lib/artifactFile";

export function UserMessage({ block }: { block: UserMessageBlock }) {
  return (
    <div className="rounded-card bg-surface-2 px-4 py-3 text-[15px] leading-relaxed text-text">
      {block.text}
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
  // Files the agent mentions (e.g. a PDF produced by running code) become clickable.
  // Each mention is resolved to a real workspace path first — prose often names a
  // bare filename ("index.html") whose file lives in a subdirectory; mentions of
  // files that don't exist get no chip.
  const mentioned = onOpenArtifact ? extractArtifactRefs(markdown) : [];
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
      <MarkdownViewer>{markdown}</MarkdownViewer>
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
                    j === row.length - 1 && "font-mono text-[13px] text-link",
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

export function StatusLine({ block }: { block: StatusLineBlock }) {
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
