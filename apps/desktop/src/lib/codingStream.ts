import type { CodingStepBlock } from "@fishes/shared";

// Mirrors lib/review.ts: the agent narrates open coding by emitting one
// ```coding fenced JSON block per segment. Unlike review (one block per turn),
// a coding turn carries many, so we extract them all in order and render each
// as its own card that streams in segment-by-segment.
const FENCE = /```coding\s*\n([\s\S]*?)\n```/g;

/**
 * Extract every ```coding block the agent emitted, in order, and return the
 * prose with those fences removed. A block needs both `quote` and `code`;
 * malformed or incomplete blocks are skipped (during streaming a half-written
 * block simply hasn't matched yet and appears as raw text until it closes).
 */
export function splitCodingSteps(markdown: string): { clean: string; steps: CodingStepBlock[] } {
  const steps: CodingStepBlock[] = [];
  FENCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE.exec(markdown)) !== null) {
    try {
      const p = JSON.parse(m[1]) as {
        quote?: unknown;
        code?: unknown;
        memo?: unknown;
        source?: unknown;
      };
      if (typeof p.quote === "string" && p.quote && typeof p.code === "string" && p.code) {
        steps.push({
          kind: "coding-step",
          quote: p.quote,
          code: p.code,
          memo: typeof p.memo === "string" ? p.memo : undefined,
          source: typeof p.source === "string" ? p.source : undefined,
        });
      }
    } catch {
      // malformed JSON in this block: skip it, keep the rest
    }
  }
  const clean = steps.length > 0 ? markdown.replace(FENCE, "").trim() : markdown;
  return { clean, steps };
}
