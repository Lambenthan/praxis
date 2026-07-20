import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ArtifactBlock } from "@fishes/shared";
import { EXAMPLE_DIRS, findSession } from "@/lib/mock";
import { useUiStore } from "@/lib/store";
import { fileInspectorFromBlock } from "@/lib/artifacts";
import { installExample, isTauri } from "@/lib/tauri";
import { ThreadView } from "@/components/thread/ThreadView";
import { InspectorShell } from "@/components/inspector/InspectorShell";
import { MaximizePaneButton, RightPane } from "@/components/inspector/RightPane";
import { EmptyState } from "@/components/cards/EmptyState";
import { useT } from "@/lib/i18n";

export function SessionPage() {
  const t = useT();
  const { sessionId } = useParams();
  const session = sessionId ? findSession(sessionId) : undefined;
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);
  const setInspectorOpen = useUiStore((s) => s.setInspectorOpen);

  // A clicked file card overrides the session's default inspector.
  const [active, setActive] = useState<ArtifactBlock | null>(null);
  useEffect(() => setActive(null), [sessionId]);

  // The example's REAL artifact files ship as app resources; materialize them
  // under <base>/examples/<dir> so every preview below reads a genuine file.
  // Idempotent and never overwrites — safe to fire on every visit.
  const dir = sessionId ? EXAMPLE_DIRS[sessionId] : undefined;
  useEffect(() => {
    if (isTauri && dir) void installExample(dir).catch(() => {});
  }, [dir]);

  if (!session) {
    return <EmptyState title={t("Session not found")} hint={t("Pick a session from the sidebar.")} />;
  }

  // The transcript's own file cards carry the run's original (scrubbed) paths;
  // redirect any click to the bundled copy of the same file so it opens the
  // real bytes, exactly like a live session opens its workspace files.
  const openArtifact = (a: ArtifactBlock) => {
    const filename = a.path.split(/[\\/]/).pop() ?? a.filename;
    setActive(dir ? { ...a, filename, path: `examples/${dir}/${filename}`, root: "base" } : a);
    setInspectorOpen(true);
  };

  const inspector = active ? fileInspectorFromBlock(active) : session.inspector;
  const showInspector = inspectorOpen && !!inspector;

  return (
    <div className="flex h-full min-w-0">
      <div className="min-w-0 flex-1">
        <ThreadView session={session} onArtifactOpen={openArtifact} />
      </div>
      {showInspector && (
        <RightPane
          onClose={() => {
            setActive(null);
            setInspectorOpen(false);
          }}
        >
          <InspectorShell
            inspector={inspector!}
            onClose={() => {
              setActive(null);
              setInspectorOpen(false);
            }}
            controls={<MaximizePaneButton />}
          />
        </RightPane>
      )}
    </div>
  );
}
