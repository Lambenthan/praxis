import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { ABook } from "@/components/icons/anthropic";
import { LibraryChatDrawer } from "@/features/library/LibraryChatDrawer";
import { LibraryView } from "@/features/library/LibraryView";
import { WikiView } from "@/features/library/WikiView";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { useRuntimeStore } from "@/lib/runtime";

const VIEW_KEY = "literature-view";

type View = "library" | "wiki";

/**
 * The literature workbench, two views under one roof:
 * - Library — the app's own Zotero-style reference manager (collections /
 *   item table / metadata editor / PDF reading with annotations).
 * - Wiki — the generated empirical wikis (one folder per sub-research):
 *   entity tree, Obsidian-like card reading, and the connection graph.
 * The conversation drawer docks beside either view.
 */
export function LiteraturePage() {
  const t = useT();
  const [view, setView] = useState<View>(() => {
    const stored = localStorage.getItem(VIEW_KEY);
    // "graph" is the pre-rename stored value for the wiki tab.
    return stored === "wiki" || stored === "graph" ? "wiki" : "library";
  });
  const switchView = (v: View) => {
    setWikiWatch(null); // an explicit tab choice cancels the jump-on-finish
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };
  // The docked conversation: same live session as /live, beside the library —
  // so organizing references never means leaving this page.
  const [chatOpen, setChatOpen] = useState(false);

  // Generate-wiki follow-through: once a generation is dispatched, adopt its
  // (freshly created) session, and when that turn finishes jump to the Wiki
  // tab — the researcher should land on the result, not stay on the import
  // list (user-reported). Cleared if they navigate the tabs themselves.
  const [wikiWatch, setWikiWatch] = useState<null | { sid: string | null }>(null);
  const currentId = useRuntimeStore((s) => s.currentId);
  const running = useRuntimeStore((s) => !!(s.currentId && s.runningSessions[s.currentId]));
  const sending = useRuntimeStore((s) => s.sending);
  useEffect(() => {
    if (!wikiWatch) return;
    if (!wikiWatch.sid) {
      // The fresh send is creating its session — adopt it once it exists.
      if (currentId && (running || sending)) setWikiWatch({ sid: currentId });
      return;
    }
    if (wikiWatch.sid === currentId && !running && !sending) {
      setWikiWatch(null);
      switchView("wiki");
    }
  }, [wikiWatch, currentId, running, sending]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <ABook size={16} className="text-muted" />
        <span className="text-sm font-medium text-text">{t("Literature")}</span>
        <div className="ml-3 flex items-center gap-0.5 rounded-input bg-surface-2 p-0.5">
          <TabBtn active={view === "library"} onClick={() => switchView("library")}>
            {t("Library")}
          </TabBtn>
          <TabBtn active={view === "wiki"} onClick={() => switchView("wiki")}>
            {t("Wiki")}
          </TabBtn>
        </div>
        <div className="flex-1" />
        <button
          className={cn("ml-2", chatOpen ? "text-text" : "text-muted hover:text-text")}
          aria-label={t("Conversation")}
          title={t("Conversation")}
          onClick={() => setChatOpen((o) => !o)}
        >
          <MessageSquare size={15} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Both views stay MOUNTED and toggle via CSS — unmounting on tab
            switch dropped the Wiki's open card / scroll / filter every time
            the user peeked at the library (user-reported). */}
        <div className={cn("min-w-0 flex-1 flex-col", view === "library" ? "flex" : "hidden")}>
          <LibraryView onOpenChat={() => setChatOpen(true)} onGenerateStarted={() => setWikiWatch({ sid: null })} />
        </div>
        <div className={cn("min-w-0 flex-1 flex-col", view === "wiki" ? "flex" : "hidden")}>
          <WikiView />
        </div>
        {chatOpen && <LibraryChatDrawer onClose={() => setChatOpen(false)} />}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        // Prominent segmented control (user-reported as too easy to miss):
        // larger hit area, 13.5px medium labels, active tab clearly lifted.
        "rounded-[7px] px-3.5 py-1 text-[13.5px] font-medium transition-colors",
        // Color, not just size: the active tab carries the app's one accent —
        // a filled clay pill reads instantly against the neutral track.
        active ? "bg-accent text-accent-fg shadow-sm" : "text-text-300 hover:text-text-100",
      )}
    >
      {children}
    </button>
  );
}
