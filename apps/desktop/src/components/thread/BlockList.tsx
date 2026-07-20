import { memo, useEffect, useState } from "react";
import { ACheck, AChevronRight } from "@/components/icons/anthropic";
import type { ArtifactBlock, FigureAnnotation, ThreadBlock, ToolCallBlock } from "@fishes/shared";
import { subagentActivity, useRuntimeStore } from "@/lib/runtime";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { AgentMessage, DataTable, RunningJobsOverlay, StatusLine, UserMessage } from "./atoms";
import { ToolCallRow } from "./ToolCallRow";
import { ReviewerCard } from "./ReviewerCard";
import { CodingStepCard } from "./CodingStepCard";
import { StepSummaryRow } from "./StepSummaryRow";
import { FigureBlock } from "./FigureBlock";
import { ArtifactCard } from "./ArtifactCard";

// Row components memoized once, at module level. `foldEvent` copies the blocks
// array but replaces ONLY the block object an SSE event touched — every other
// block keeps its identity — so with memoized rows a streamed token or a tool
// update re-renders exactly one row. Without this, every event re-rendered
// every row, including a full ReactMarkdown (remark + KaTeX) re-parse of every
// past agent message: on a long thread that saturated the main thread for the
// whole turn (the drawer felt stuck), and WKWebView showed the not-yet-painted
// history as a huge blank stretch above the fresh content at the bottom (the
// same paint-starvation failure mode documented on `.shimmer-text` in
// index.css). Handlers must be reference-stable for the memo to hold — the
// live page memoizes its handlers object; the drawer passes none.
const MemoUserMessage = memo(UserMessage);
const MemoAgentMessage = memo(AgentMessage);
const MemoStepSummaryRow = memo(StepSummaryRow);
const MemoToolCallRow = memo(ToolCallRow);
const MemoReviewerCard = memo(ReviewerCard);
const MemoCodingStepCard = memo(CodingStepCard);
const MemoDataTable = memo(DataTable);
const MemoFigureBlock = memo(FigureBlock);
const MemoArtifactCard = memo(ArtifactCard);
const MemoRunningJobsOverlay = memo(RunningJobsOverlay);
const MemoStatusLine = memo(StatusLine);

export interface BlockHandlers {
  /** Open an artifact in the inspector (live session). */
  onArtifactOpen?: (a: ArtifactBlock) => void;
  /** Forward a figure annotation to the agent (live session). */
  onFigureComment?: (annotation: FigureAnnotation, figureTitle: string) => void;
  /** Live one-line activity of the subagent a task tool spawned (live session). */
  subagentActivity?: (childSessionId: string) => string | undefined;
  /** The subagent's full folded thread, so a task row can expand into it. */
  subagentThread?: (childSessionId: string) => ThreadBlock[] | undefined;
}

export function renderBlock(block: ThreadBlock, i: number, handlers?: BlockHandlers) {
  switch (block.kind) {
    case "user":
      return <MemoUserMessage key={i} block={block} />;
    case "agent":
      return <MemoAgentMessage key={i} markdown={block.markdown} onOpenArtifact={handlers?.onArtifactOpen} />;
    case "step-summary":
      return <MemoStepSummaryRow key={i} block={block} />;
    case "tool-call":
      if (block.childSessionId)
        return <SubagentRow key={i} block={block} handlers={handlers} />;
      return <MemoToolCallRow key={i} block={block} />;
    case "reviewer":
      return <MemoReviewerCard key={i} block={block} />;
    case "coding-step":
      return <MemoCodingStepCard key={i} block={block} />;
    case "table":
      return <MemoDataTable key={i} block={block} />;
    case "figure":
      return <MemoFigureBlock key={i} block={block} onComment={handlers?.onFigureComment} />;
    case "artifact":
      return <MemoArtifactCard key={i} block={block} onOpen={handlers?.onArtifactOpen} />;
    case "running-jobs":
      return <MemoRunningJobsOverlay key={i} block={block} />;
    case "status-line":
      return <MemoStatusLine key={i} block={block} />;
  }
}

/** A task (subagent) row bound to the live store: it subscribes to ITS child
 *  session's thread only, so a heavy subagent stream re-renders this one row —
 *  not the page or the whole list (the memoized BlockList sees stable props).
 *  Handler-fed data (tests, example threads) wins when present; the store is
 *  the live fallback. Memoized like the other rows: the parent list re-renders
 *  on every event of the MAIN session, and this row must not re-render with it
 *  (its own child subscription covers the child's stream). */
const SubagentRow = memo(function SubagentRow({
  block,
  handlers,
}: {
  block: ToolCallBlock;
  handlers?: BlockHandlers;
}) {
  const childId = block.childSessionId!;
  const liveChild = useRuntimeStore((s) => s.threads[childId]);
  // A settled task row seen without its child thread (app reload, session
  // reopened later) fetches the history once, so its step count and result
  // line appear without an expand. Running rows wait for live events instead —
  // replacing a thread mid-stream would duplicate its updating blocks.
  const settled = block.status !== "running" && block.status !== "pending";
  useEffect(() => {
    if (settled && !liveChild) void useRuntimeStore.getState().loadChildSession(childId);
  }, [settled, liveChild, childId]);
  const childBlocks = handlers?.subagentThread?.(childId) ?? liveChild?.blocks;
  const activity =
    handlers?.subagentActivity?.(childId) ??
    (liveChild ? subagentActivity(liveChild.blocks) : undefined);
  return (
    <ToolCallRow
      block={block}
      activity={activity}
      childBlocks={childBlocks}
      // Expanding loads the child's history when nothing streamed it live
      // (finished before this app run, reload mid-run) — a no-op otherwise.
      onExpand={() => void useRuntimeStore.getState().loadChildSession(childId)}
      renderChildren={(blocks) => <BlockList blocks={blocks} handlers={handlers} />}
    />
  );
});

/** A quiet mechanical step: groupable. Prominent rows (approval, warning,
 *  failure) and subagent drill-downs always stand alone. */
function isQuietTool(b: ThreadBlock): b is ToolCallBlock {
  return (
    b.kind === "tool-call" &&
    !b.childSessionId &&
    b.status !== "waiting-approval" &&
    b.status !== "warning" &&
    b.status !== "failed"
  );
}

/** A run of quiet steps folds under one titled header ("<first step> · N
 *  steps"), the way Claude Science groups a task's steps. Open while any
 *  step still runs; a finished group rests collapsed — the log is there,
 *  not in the way. */
function StepGroup({
  blocks,
  start,
  handlers,
}: {
  blocks: ToolCallBlock[];
  start: number;
  handlers?: BlockHandlers;
}) {
  const t = useT();
  const running = blocks.some((b) => b.status === "running" || b.status === "pending");
  const [open, setOpen] = useState(running);
  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);
  return (
    <div data-step-group className="rounded-tool bg-tool-card px-1.5 py-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[34px] w-full items-center gap-2 rounded-input px-1.5 py-1.5 text-left transition-colors hover:bg-tool-out"
      >
        <span
          className={cn("inline-flex w-4 shrink-0 justify-center", running ? "text-accent" : "text-ok")}
          role="img"
        >
          {/* CS grammar: a pulsing accent dot while the group runs, not a spinner. */}
          {running ? (
            <span aria-hidden className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          ) : (
            <ACheck size={13} />
          )}
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-[13px]", running ? "shimmer-text" : "text-text-200")}>
          {blocks[0].title}
        </span>
        <span className="shrink-0 text-[12.5px] tabular-nums text-text-400">
          {blocks.length} {t("steps")}
        </span>
        <AChevronRight
          size={13}
          className={cn("shrink-0 text-text-400 transition-transform duration-200", open && "rotate-90")}
        />
      </button>
      {open && (
        <div className="ml-[13px] flex flex-col gap-1 border-l border-border pl-2 pt-1">
          {blocks.map((b, i) => renderBlock(b, start + i, handlers))}
        </div>
      )}
    </div>
  );
}

/** Consecutive produced files present as a captioned grid — GENERATED · N —
 *  instead of a stack of full-width cards. */
function GeneratedGrid({
  blocks,
  start,
  handlers,
}: {
  blocks: ArtifactBlock[];
  start: number;
  handlers?: BlockHandlers;
}) {
  const t = useT();
  return (
    <div data-generated>
      <div className="px-1 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {t("Generated")} · {blocks.length}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {blocks.map((b, i) => (
          <div key={start + i} className="min-w-0">
            {renderBlock(b, start + i, handlers)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Memoized: a long thread (hundreds of tool-call blocks) must not re-render on
// every unrelated parent update (composer keystrokes, working toggle, workspace
// switch). It re-renders only when `blocks` or `handlers` actually change — the
// drawer passes no handlers, so opening a big conversation renders once.
export const BlockList = memo(function BlockList({
  blocks,
  handlers,
}: {
  blocks: ThreadBlock[];
  handlers?: BlockHandlers;
}) {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (isQuietTool(b)) {
      let j = i;
      while (j < blocks.length && isQuietTool(blocks[j])) j++;
      if (j - i >= 3) {
        out.push(
          <StepGroup
            key={`g${i}`}
            blocks={blocks.slice(i, j) as ToolCallBlock[]}
            start={i}
            handlers={handlers}
          />,
        );
        i = j;
        continue;
      }
    }
    if (b.kind === "artifact") {
      let j = i;
      while (j < blocks.length && blocks[j].kind === "artifact") j++;
      if (j - i >= 2) {
        out.push(
          <GeneratedGrid
            key={`a${i}`}
            blocks={blocks.slice(i, j) as ArtifactBlock[]}
            start={i}
            handlers={handlers}
          />,
        );
        i = j;
        continue;
      }
    }
    out.push(renderBlock(b, i, handlers));
    i++;
  }
  return <>{out}</>;
});
