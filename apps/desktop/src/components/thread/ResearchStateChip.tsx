import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import type { ArtifactBlock } from "@ai4s/shared";
import { readArtifact } from "@/lib/artifactFile";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/** The slice of research-state.json the chip needs (schema owned by the
 *  research-navigator skill/agent; unknown fields are ignored). */
interface ResearchState {
  phase: string;
  pending: number;
}

const PHASE_LABEL: Record<string, string> = {
  framing: "Framing",
  gap_check: "Gap check",
  design: "Design",
  collection: "Collection",
  analysis: "Analysis",
  review: "Review",
  writing: "Writing",
  done: "Done",
};

export const STATE_FILE = "research-state.json";

/** Parse the navigator's state file into what the chip shows; null = not a
 *  usable state file (absent, binary, or malformed — the chip just hides). */
export function parseResearchState(text: string): ResearchState | null {
  try {
    const raw = JSON.parse(text) as {
      phase?: unknown;
      open_decisions?: Array<{ status?: unknown }>;
    };
    if (typeof raw.phase !== "string") return null;
    const pending = (raw.open_decisions ?? []).filter((d) => d?.status === "open").length;
    return { phase: raw.phase, pending };
  } catch {
    return null;
  }
}

/**
 * Where the project stands, always in view: a session whose workspace carries
 * a navigator state file gets a quiet header chip — current phase, plus how
 * many decisions wait on the researcher (the number that matters most in a
 * human-gated workflow). Clicking opens the state file itself. Sessions
 * without a state file render nothing.
 */
export function ResearchStateChip({
  refreshKey,
  onOpen,
}: {
  /** Bump to re-read the file (e.g. when a turn completes). */
  refreshKey: string | number;
  onOpen: (artifact: ArtifactBlock) => void;
}) {
  const t = useT();
  const [state, setState] = useState<ResearchState | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const file = await readArtifact(STATE_FILE).catch(() => null);
      if (!alive) return;
      setState(file && file.encoding === "utf8" ? parseResearchState(file.data) : null);
    })();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (!state) return null;
  const phase = PHASE_LABEL[state.phase] ?? state.phase;
  return (
    <button
      onClick={() =>
        onOpen({
          kind: "artifact",
          path: STATE_FILE,
          filename: STATE_FILE,
          artifact: "data",
          tool: "research-navigator",
          language: "json",
        })
      }
      className={cn(
        "flex items-center gap-1.5 rounded-input px-2 py-0.5 text-xs ring-1 hover:bg-surface-2",
        state.pending > 0
          ? "bg-accent/10 text-accent ring-accent/30"
          : "bg-surface text-muted ring-border",
      )}
      title={t("Research project state — click to open research-state.json")}
      data-testid="research-state-chip"
    >
      <Compass size={12} />
      <span>{t(phase)}</span>
      {state.pending > 0 && (
        <span className="font-medium tabular-nums">
          · {state.pending} {t(state.pending === 1 ? "decision pending" : "decisions pending")}
        </span>
      )}
    </button>
  );
}
