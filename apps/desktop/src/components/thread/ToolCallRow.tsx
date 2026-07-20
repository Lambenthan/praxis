import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Clock, ShieldQuestion } from "lucide-react";
import { ACheck, AChevronRight } from "@/components/icons/anthropic";
import type { ThreadBlock, ToolCallBlock, ToolCallStatus } from "@fishes/shared";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { mmss, useElapsed } from "@/lib/useElapsed";
import { highlightShell } from "@/lib/shellHighlight";

const STATUS: Record<
  ToolCallStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending: { label: "Pending", icon: <Clock size={13} />, className: "text-muted" },
  running: {
    label: "Running",
    // CS grammar: a pulsing accent dot, never a spinning loader (audit 02 A3).
    icon: <span aria-hidden className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />,
    className: "text-accent",
  },
  "waiting-approval": { label: "Waiting", icon: <ShieldQuestion size={14} />, className: "text-warn" },
  success: { label: "Success", icon: <ACheck size={14} />, className: "text-mineral" },
  warning: { label: "Warning", icon: <AlertTriangle size={14} />, className: "text-warn" },
  failed: { label: "Failed", icon: <AlertCircle size={15} />, className: "text-error" },
};

/** The card's language label (left) and runtime env (right), the way the
 *  target shows "BASH · ENV python". The env reads truer from what the command
 *  actually invokes than from the tool name (a bash line running python → the
 *  python env). Returns a null env when nothing distinct can be inferred. */
function describeTool(tool?: string, command?: string): { lang: string; env: string | null } {
  const c = (command ?? "").toLowerCase();
  const s = (tool ?? "").toLowerCase();
  let env: string | null = null;
  if (/\bpython3?\b|\.py\b|\bpip3?\b|statsmodels|pandas|numpy/.test(c)) env = "python";
  else if (/\bstata\b|\.do\b/.test(c)) env = "stata";
  else if (/\brscript\b|\.r\b/.test(c)) env = "R";
  else if (s.includes("bash") || s === "shell") env = "bash";
  else if (s.includes("python") || s.includes("jupyter")) env = "python";
  else if (s.includes("stata")) env = "stata";
  let lang = "Shell";
  if (s.includes("bash") || s === "shell") lang = "Bash";
  else if (s.includes("python") || s.includes("jupyter")) lang = "Python";
  else if (s.includes("stata")) lang = "Stata";
  else if (s.includes("write") || s.includes("edit")) lang = "Edit";
  else if (s.includes("read")) lang = "Read";
  else if (s) lang = s.charAt(0).toUpperCase() + s.slice(1);
  return { lang, env };
}

// Mechanical steps that succeeded (or are pending/running) are recorded quietly,
// like a calm activity log — a scientist scans the conversation for results and
// artifacts, not every shell command. Only things that need attention
// (waiting for approval, warnings, failures) get a prominent card.
const PROMINENT = new Set<ToolCallStatus>(["waiting-approval", "warning", "failed"]);

/** One line of the child's final reply, shown quietly on a settled task row —
 *  the batch's result at a glance, without opening the whole thread. */
function childResultLine(blocks?: ThreadBlock[]): string | undefined {
  for (let i = (blocks?.length ?? 0) - 1; i >= 0; i--) {
    const b = blocks![i];
    if (b.kind === "agent" && b.markdown.trim()) {
      const line = b.markdown.trim().split("\n").find((l) => l.trim());
      // Strip leading heading markers / bold so the line reads as plain text.
      return line?.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim() || undefined;
    }
  }
  return undefined;
}

export function ToolCallRow({
  block,
  activity,
  childBlocks,
  onExpand,
  renderChildren,
}: {
  block: ToolCallBlock;
  activity?: string;
  /** The spawned subagent's own folded thread — present only for a task row. */
  childBlocks?: ThreadBlock[];
  /** The row was just expanded (task rows load their child's history here). */
  onExpand?: () => void;
  /** Render the child thread (passed from BlockList to avoid an import cycle). */
  renderChildren?: (blocks: ThreadBlock[]) => React.ReactNode;
}) {
  const t = useT();
  const s = STATUS[block.status];
  const prominent = PROMINENT.has(block.status);
  const isSubagent = !!block.childSessionId;
  const running = block.status === "running";
  // Every card starts collapsed — expanding is the reader's choice, never
  // automatic. (Opening on `outputSummary` surprised users: agent-driven
  // Stata/shell steps popped themselves open mid-thread.)
  const [open, setOpen] = useState(false);
  // The target's card has two levels: opening reveals the command (green code
  // block); "Show output" then reveals the transcript beneath it.
  const [showOut, setShowOut] = useState(false);
  const steps = childBlocks?.filter((b) => b.kind === "tool-call").length ?? 0;
  // Every running row ticks mm:ss — a multi-minute step (pip downloading,
  // uv provisioning Python) must read as alive, not frozen on a spinner.
  const elapsed = useElapsed(running);
  // The two levels of the target's tool card (non-subagent rows below). A
  // long-running step's output can reach 200k chars and grows on every
  // tool.updated event — count its lines only when it actually changes, not on
  // every render (the elapsed clock re-renders this row every second). Hooks
  // stay above the subagent early-return: a task row can gain its
  // childSessionId on a later event and must not change the hook order.
  const cmd = block.command || block.inputSummary || "";
  const out = block.output || block.outputSummary || "";
  const outputLines = useMemo(() => (out ? out.split("\n").length : 0), [out]);

  // A subagent (task) row is a drill-down: the header is a toggle, a meta chip
  // shows how many steps it has taken and how long it has run, and expanding it
  // reveals the child's own tool thread — the way Claude Code lets you inspect a
  // Task instead of hiding it behind one line. Non-subagent rows render as before.
  if (isSubagent) {
    const result = !running && !open ? childResultLine(childBlocks) : undefined;
    // Task rows share the quiet tool-row grammar (soft shell, 13px sans title,
    // text tokens) — the earlier blue-mono treatment stood out of the thread.
    return (
      <div data-status={block.status} data-subagent className="rounded-tool bg-tool-card px-1.5 py-1">
        <button
          type="button"
          onClick={() => {
            if (!open) onExpand?.();
            setOpen((v) => !v);
          }}
          className="flex min-h-[34px] w-full items-center gap-2 rounded-input px-1.5 py-1.5 text-left transition-colors hover:bg-tool-out"
          aria-expanded={open}
        >
          <span
            className={cn("inline-flex w-4 shrink-0 justify-center", s.className)}
            aria-label={t(s.label)}
            role="img"
          >
            {s.icon}
          </span>
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", running ? "shimmer-text" : "text-text-200")}>
            {block.title}
          </span>
          {steps > 0 && (
            <span className="shrink-0 text-[12.5px] tabular-nums text-text-400">
              {steps} {t(steps === 1 ? "step" : "steps")}
            </span>
          )}
          {running && (
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-400">
              {mmss(elapsed)}
            </span>
          )}
          <AChevronRight
            size={13}
            className={cn("shrink-0 text-text-400 transition-transform duration-200", open && "rotate-90")}
          />
        </button>
        {/* Collapsed + running: one quiet line of the child's latest step, so you
            see life without opening. Collapsed + settled: one line of the
            child's final reply. Open: the child's whole thread under a rail. */}
        {!open && running && activity && (
          <div className="flex items-center gap-2 px-2 pb-1 text-[12px]" data-subagent-activity>
            <span
              aria-hidden
              className="mb-1.5 ml-[6px] h-2 w-2 shrink-0 rounded-bl border-b border-l border-border"
            />
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            <span className="shimmer-text min-w-0 flex-1 truncate">{activity}</span>
          </div>
        )}
        {result && (
          <div className="flex items-center gap-2 px-2 pb-1 text-[12px] text-text-300" data-subagent-result>
            <span
              aria-hidden
              className="mb-1.5 ml-[6px] h-2 w-2 shrink-0 rounded-bl border-b border-l border-border"
            />
            <span className="min-w-0 flex-1 truncate">{result}</span>
          </div>
        )}
        {open && childBlocks && childBlocks.length > 0 && (
          <div className="ml-[13px] mt-0.5 flex flex-col gap-1 border-l border-border pl-2 pt-1" data-subagent-thread>
            {renderChildren?.(childBlocks)}
          </div>
        )}
        {open && (!childBlocks || childBlocks.length === 0) && (
          <div className="ml-[13px] border-l border-border py-1 pl-2 text-xs text-muted">
            {/* Undefined childBlocks = the child's history is still being
                fetched (onExpand); a loaded-but-empty thread truly has none. */}
            {t(running ? "Working…" : childBlocks ? "No steps recorded." : "Loading…")}
          </div>
        )}
      </div>
    );
  }

  // The command (bash line / do-file) shows in a green code block when the
  // card opens; the transcript sits behind a "Show output" sub-fold beneath
  // it. A step with only output opens straight to the transcript.
  const expandable = !!cmd || !!out;
  const Row: React.ElementType = expandable ? "button" : "div";
  const { lang, env } = describeTool(block.tool, cmd);
  // A bare file-path command shows just the basename (full path on hover).
  const cmdText = /^\/\S+$/.test(cmd) ? cmd.split("/").pop() || cmd : cmd;

  // Target tool card: a soft rounded shell (tool-card-bg), a header button row
  // (status glyph in a 16px slot · title · count), and — when open — a white
  // inner card (bg-000, rounded-12, shadow-card) indented under the glyph, with
  // the command in a green code block and the output behind "Show output".
  return (
    <div
      data-status={block.status}
      className={cn(
        "rounded-tool px-1.5 py-1",
        prominent ? "bg-error/[0.06] ring-1 ring-error/20" : "bg-tool-card",
      )}
    >
      <Row
        {...(expandable
          ? { type: "button", onClick: () => setOpen((v) => !v), "aria-expanded": open }
          : {})}
        className={cn(
          "flex min-h-[34px] w-full items-center gap-2 rounded-input px-1.5 py-1.5 text-left",
          expandable && "transition-colors hover:bg-tool-out",
        )}
      >
        <span
          className={cn("inline-flex w-4 shrink-0 justify-center", s.className)}
          aria-label={t(s.label)}
          role="img"
        >
          {s.icon}
        </span>
        <span
          className={cn(
            "flex-1 truncate text-[13px]",
            prominent ? "text-text-000" : running ? "shimmer-text" : "text-text-200",
          )}
        >
          {block.title}
        </span>
        {block.meta && <span className="shrink-0 text-[12.5px] text-text-400">{block.meta}</span>}
        {!block.meta && outputLines > 0 && (
          <span className="shrink-0 text-[12.5px] tabular-nums text-text-400">
            {outputLines} {t(outputLines === 1 ? "line of output" : "lines of output")}
          </span>
        )}
        {running && (
          <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-400">
            {mmss(elapsed)}
          </span>
        )}
        {expandable && (
          <AChevronRight
            size={13}
            className={cn("shrink-0 text-text-400 transition-transform duration-200", open && "rotate-90")}
          />
        )}
      </Row>
      {expandable && open && (
        <div className="mb-1.5 ml-[30px] mr-1 mt-0.5 overflow-hidden rounded-[12px] bg-bg-000 shadow-card">
          {cmd ? (
            <>
              <div className="flex items-center px-4 pb-0 pt-3 text-[11px] tracking-[0.04em]">
                <span className="font-semibold uppercase text-text-300">{lang}</span>
                {env && (
                  <span className="ml-auto flex items-baseline gap-1.5">
                    <span className="uppercase text-text-400">env</span>
                    <span className="font-mono text-text-300">{env}</span>
                  </span>
                )}
              </div>
              {/* Command block sits inset with a full 12px margin on every side
                  (handoff §codeTint) — it must never bleed to the card's edges. */}
              <pre className="m-3 overflow-x-auto whitespace-pre-wrap break-all rounded-[8px] bg-code-bg px-4 py-3.5 font-mono text-[12.5px] leading-[1.75] text-[color:var(--syn-arg)]">
                {highlightShell(cmdText)}
              </pre>
              {out && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowOut((v) => !v)}
                    className="flex w-full items-center gap-1.5 px-4 pb-3 pt-0.5 text-left text-[13px] text-text-300 transition-colors hover:text-text-100"
                  >
                    <AChevronRight
                      size={11}
                      className={cn("shrink-0 transition-transform duration-200", showOut && "rotate-90")}
                    />
                    <span>{showOut ? t("Hide output") : t("Show output")}</span>
                  </button>
                  {showOut && (
                    <div className="mx-3 mb-3">
                      <div className="pb-1.5 pl-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-text-400">STDOUT
                      </div>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-[8px] bg-tool-out px-4 py-3 font-mono text-[11.5px] leading-[1.6] text-text-200">
                        {out}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="m-3">
              <div className="pb-1.5 pl-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-text-400">STDOUT
              </div>
              <pre className="max-h-96 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-[8px] bg-tool-out px-4 py-3 font-mono text-[11.5px] leading-[1.6] text-text-200">
                {out}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
