import { useParams } from "react-router-dom";
import { findSession } from "@/lib/mock";
import { useUiStore } from "@/lib/store";
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

  if (!session) {
    return <EmptyState title={t("Session not found")} hint={t("Pick a session from the sidebar.")} />;
  }

  const showInspector = inspectorOpen && !!session.inspector;

  return (
    <div className="flex h-full min-w-0">
      <div className="min-w-0 flex-1">
        <ThreadView session={session} />
      </div>
      {showInspector && (
        <RightPane onClose={() => setInspectorOpen(false)}>
          <InspectorShell
            inspector={session.inspector!}
            onClose={() => setInspectorOpen(false)}
            controls={<MaximizePaneButton />}
          />
        </RightPane>
      )}
    </div>
  );
}
