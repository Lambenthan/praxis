import type { CodingStepBlock } from "@fishes/shared";

/** Deterministic per-code color from the shared --series-1..8 palette, so a
 *  given code keeps the same hue everywhere it appears in the live feed. */
function chipColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(--series-${(h % 8) + 1})`;
}

/**
 * One streamed open-coding decision, rendered as a card in the thread: the
 * assigned code, the verbatim source quote it applies to, and the coder's
 * rationale. Appears segment-by-segment as the agent streams — the live view
 * of coding in progress (the persistent result is the .qcode workbench).
 *
 * Visual language: one color signal only — a full-height accent bar on the
 * card's left edge in the code's hue (text stays neutral for contrast). The
 * quote is set in serif to match source text everywhere else in the app.
 */
export function CodingStepCard({ block }: { block: CodingStepBlock }) {
  const color = chipColor(block.code);
  return (
    <div className="card-in relative overflow-hidden rounded-card border border-border bg-surface py-2.5 pl-4 pr-3.5 shadow-card">
      <span
        data-code-chip
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: color }}
      />
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-[12px] font-semibold tracking-wide text-text">{block.code}</span>
        {block.source && <span className="truncate text-[11px] text-muted">{block.source}</span>}
      </div>
      <blockquote className="font-serif text-[14px] leading-[1.75] text-text">
        “{block.quote}”
      </blockquote>
      {block.memo && (
        <p className="mt-2 border-t border-faint pt-1.5 text-[12px] leading-relaxed text-muted">
          {block.memo}
        </p>
      )}
    </div>
  );
}
