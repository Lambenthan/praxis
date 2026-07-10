import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Clock, Loader2, ShieldQuestion, X } from "lucide-react";
import type { ThreadBlock, ToolCallBlock, ToolCallStatus } from "@ai4s/shared";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { mmss, useElapsed } from "@/lib/useElapsed";

const STATUS: Record<
  ToolCallStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending: { label: "Pending", icon: <Clock size={13} />, className: "text-muted" },
  running: { label: "Running", icon: <Loader2 size={13} className="animate-spin" />, className: "text-accent" },
  "waiting-approval": { label: "Waiting", icon: <ShieldQuestion size={14} />, className: "text-warn" },
  success: { label: "Success", icon: <Check size={13} />, className: "text-ok" },
  warning: { label: "Warning", icon: <AlertTriangle size={14} />, className: "text-warn" },
  failed: { label: "Failed", icon: <X size={14} />, className: "text-error" },
};

// Mechanical steps that succeeded (or are pending/running) are recorded quietly,
// like a calm activity log — a scientist scans the conversation for results and
// artifacts, not every shell command. Only things that need attention
// (waiting for approval, warnings, failures) get a prominent card.
const PROMINENT = new Set<ToolCallStatus>(["waiting-approval", "warning", "failed"]);

export function ToolCallRow({
  block,
  activity,
  childBlocks,
  renderChildren,
}: {
  block: ToolCallBlock;
  activity?: string;
  /** The spawned subagent's own folded thread — present only for a task row. */
  childBlocks?: ThreadBlock[];
  /** Render the child thread (passed from BlockList to avoid an import cycle). */
  renderChildren?: (blocks: ThreadBlock[]) => React.ReactNode;
}) {
  const t = useT();
  const s = STATUS[block.status];
  const prominent = PROMINENT.has(block.status);
  const isSubagent = !!block.childSessionId;
  const running = block.status === "running";
  const [open, setOpen] = useState(false);
  const steps = childBlocks?.filter((b) => b.kind === "tool-call").length ?? 0;
  const elapsed = useElapsed(running && isSubagent);

  // A subagent (task) row is a drill-down: the header is a toggle, a meta chip
  // shows how many steps it has taken and how long it has run, and expanding it
  // reveals the child's own tool thread — the way Claude Code lets you inspect a
  // Task instead of hiding it behind one line. Non-subagent rows render as before.
  if (isSubagent) {
    const meta = [steps > 0 ? `${steps} ${t(steps === 1 ? "step" : "steps")}` : null, running ? mmss(elapsed) : null]
      .filter(Boolean)
      .join(" · ");
    return (
      <div data-status={block.status} data-subagent>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-input px-2 py-1 text-left text-[12.5px] transition-colors hover:bg-surface-2"
          aria-expanded={open}
        >
          <span className={cn("shrink-0", s.className)} aria-label={t(s.label)} role="img">
            {s.icon}
          </span>
          <span className={cn("flex-1 truncate font-mono", running ? "text-text" : "text-muted")}>
            {block.title}
          </span>
          {meta && <span className="shrink-0 font-mono text-[11px] text-muted/80 tabular-nums">{meta}</span>}
          <ChevronRight
            size={13}
            className={cn(
              "shrink-0 text-muted/60 transition-transform duration-200",
              open && "rotate-90",
            )}
          />
        </button>
        {/* Collapsed + running: one quiet line of the child's latest step, so you
            see life without opening. Open: the child's whole thread, indented
            under a rail. */}
        {!open && running && activity && (
          <div className="flex items-center gap-2 px-2 pb-0.5 text-xs" data-subagent-activity>
            <span
              aria-hidden
              className="mb-1.5 ml-[6px] h-2 w-2 shrink-0 rounded-bl border-b border-l border-border"
            />
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            <span className="shimmer-text min-w-0 flex-1 truncate font-mono">{activity}</span>
          </div>
        )}
        {open && childBlocks && childBlocks.length > 0 && (
          <div className="ml-3 mt-0.5 border-l border-faint pl-3" data-subagent-thread>
            {renderChildren?.(childBlocks)}
          </div>
        )}
        {open && (!childBlocks || childBlocks.length === 0) && (
          <div className="ml-3 border-l border-faint py-1 pl-3 text-xs text-muted">
            {t(running ? "Working…" : "No steps recorded.")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-status={block.status}>
      <div
        className={cn(
          "flex items-center gap-2",
          prominent
            ? "rounded-input border border-border bg-surface px-3 py-2 text-sm"
            : "px-2 py-1 text-[12.5px]",
        )}
      >
        <span className={cn("shrink-0", s.className)} aria-label={t(s.label)} role="img">
          {s.icon}
        </span>
        <span
          className={cn(
            "flex-1 truncate",
            prominent ? "text-text" : cn("font-mono", block.status === "running" ? "text-text" : "text-muted"),
          )}
        >
          {block.title}
        </span>
        {block.meta && <span className="shrink-0 text-xs text-muted">{block.meta}</span>}
      </div>
      {/* Output worth reading inline: a user-typed "!" command's result, or a
          Stata run's log tail. A light IN/OUT panel — a gutter label beside mono
          content, the way a terminal transcript reads. The IN, when it's a bare
          file path, shows just the basename (full path on hover) so a long temp
          path doesn't dominate. Other agent steps stay one quiet line. */}
      {(block.inputSummary || block.outputSummary) && (
        <div className="ml-2 mt-1 overflow-hidden rounded-input border border-faint bg-surface font-mono text-xs leading-5">
          {block.inputSummary && (
            <div className="flex gap-2.5 border-b border-faint px-2.5 py-1.5">
              <span className="w-7 shrink-0 select-none pt-px text-[10px] font-medium uppercase tracking-[0.08em] text-muted/70">
                in
              </span>
              <pre
                className="min-w-0 flex-1 truncate whitespace-pre-wrap break-all text-text"
                title={block.inputSummary}
              >
                {/^\/\S+$/.test(block.inputSummary)
                  ? block.inputSummary.split("/").pop() || block.inputSummary
                  : block.inputSummary}
              </pre>
            </div>
          )}
          {block.outputSummary && (
            <div className="flex gap-2.5 px-2.5 py-1.5">
              <span className="w-7 shrink-0 select-none pt-px text-[10px] font-medium uppercase tracking-[0.08em] text-muted/70">
                out
              </span>
              <pre className="max-h-64 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-all text-text">
                {block.outputSummary}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
