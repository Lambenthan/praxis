import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { ArtifactBlock, Session } from "@fishes/shared";
import { useMemo, useState } from "react";
import { BlockList } from "./BlockList";
import { LastMessagePill } from "./LastMessagePill";
import { useRuntimeStore } from "@/lib/runtime";
import { useT } from "@/lib/i18n";

export function ThreadView({
  session,
  onArtifactOpen,
}: {
  session: Session;
  onArtifactOpen?: (a: ArtifactBlock) => void;
}) {
  const t = useT();
  const isExample = session.group === "Examples";
  // Before a provider is connected, the "start a real session" CTA leads to
  // the setup guide (a live session can't run yet); once configured it opens
  // a fresh live session as usual.
  const newSessionTo = useRuntimeStore((s) => s.setupNeeded) === true ? "/setup" : "/live";
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  // Stable handlers object so the memoized BlockList isn't invalidated on every
  // ThreadView re-render.
  const handlers = useMemo(() => ({ onArtifactOpen }), [onArtifactOpen]);
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b border-faint px-6 py-3">
        <h1 className="truncate text-[15px] font-medium text-text">{session.title}</h1>
        {isExample && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted ring-1 ring-border">
            {t("Example · read-only")}
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <LastMessagePill container={scroller} />
        <div ref={setScroller} className="h-full overflow-y-auto">
          <div className="mx-auto flex max-w-[820px] flex-col gap-7 px-10 py-8">
            <BlockList blocks={session.blocks} handlers={handlers} />
          </div>
        </div>
      </div>
      <div className="px-8 pb-5 pt-2">
        <div className="mx-auto flex max-w-[820px] items-center gap-3 rounded-card border border-border bg-surface-2/60 px-4 py-3 text-sm text-muted">
          <Sparkles size={16} className="shrink-0 text-accent" />
          <span className="min-w-0">
            {t("This is a sample session. Start a live agent session to chat for real.")}
          </span>
          {/* The button never wraps or compresses — the copy on the left yields
              space first (min-w-0), so a narrow window can't split "New session"
              across two lines. */}
          <Link
            to={newSessionTo}
            className="ml-auto shrink-0 whitespace-nowrap rounded-input bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
          >
            {t("New session")}
          </Link>
        </div>
      </div>
    </div>
  );
}
