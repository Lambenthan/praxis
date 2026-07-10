import type { ArtifactBlock, FigureAnnotation, ThreadBlock } from "@ai4s/shared";
import { AgentMessage, DataTable, RunningJobsOverlay, StatusLine, UserMessage } from "./atoms";
import { ToolCallRow } from "./ToolCallRow";
import { ReviewerCard } from "./ReviewerCard";
import { CodingStepCard } from "./CodingStepCard";
import { StepSummaryRow } from "./StepSummaryRow";
import { FigureBlock } from "./FigureBlock";
import { ArtifactCard } from "./ArtifactCard";

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
      return <UserMessage key={i} block={block} />;
    case "agent":
      return <AgentMessage key={i} markdown={block.markdown} onOpenArtifact={handlers?.onArtifactOpen} />;
    case "step-summary":
      return <StepSummaryRow key={i} block={block} />;
    case "tool-call":
      return (
        <ToolCallRow
          key={i}
          block={block}
          activity={
            block.childSessionId ? handlers?.subagentActivity?.(block.childSessionId) : undefined
          }
          childBlocks={
            block.childSessionId ? handlers?.subagentThread?.(block.childSessionId) : undefined
          }
          renderChildren={(childBlocks) => <BlockList blocks={childBlocks} handlers={handlers} />}
        />
      );
    case "reviewer":
      return <ReviewerCard key={i} block={block} />;
    case "coding-step":
      return <CodingStepCard key={i} block={block} />;
    case "table":
      return <DataTable key={i} block={block} />;
    case "figure":
      return <FigureBlock key={i} block={block} onComment={handlers?.onFigureComment} />;
    case "artifact":
      return <ArtifactCard key={i} block={block} onOpen={handlers?.onArtifactOpen} />;
    case "running-jobs":
      return <RunningJobsOverlay key={i} block={block} />;
    case "status-line":
      return <StatusLine key={i} block={block} />;
  }
}

export function BlockList({
  blocks,
  handlers,
}: {
  blocks: ThreadBlock[];
  handlers?: BlockHandlers;
}) {
  return <>{blocks.map((b, i) => renderBlock(b, i, handlers))}</>;
}
