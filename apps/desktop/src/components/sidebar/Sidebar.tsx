import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { MessageSquareWarning, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { ABook, AChevronDown, ACustomize, AFile, ANotebook, APanel, APlus, ASearch, ASettings } from "@/components/icons/anthropic";
import type { Project } from "@fishes/shared";
import { cn } from "@/lib/cn";
import { openFeedback } from "@/lib/feedback";
import { useT } from "@/lib/i18n";
import { isTauri } from "@/lib/tauri";
import { useRuntimeStore } from "@/lib/runtime";
import { baseName } from "@/components/thread/WorkspaceChip";
import { SIDEBAR_MAX, SIDEBAR_MIN, useUiStore } from "@/lib/store";
import { StatusPills } from "./StatusPills";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import mark from "@/assets/fishes-mark.svg";
import markReversed from "@/assets/fishes-mark-reversed.svg";

interface Row {
  id: string;
  title: string;
  to: string;
  kind: "session" | "example";
}

/** Dragging the divider below this pointer x collapses the sidebar; dragging
 *  back past it re-expands. Sits below SIDEBAR_MIN so there is a clear "snap". */
const COLLAPSE_BELOW = 140;

export function Sidebar({ project }: { project: Project }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { sessions, hiddenExamples, startDraft, closeProject, deleteSession, hideExample, workspace, workspacePinned, setupNeeded } =
    useRuntimeStore();
  const { sidebarCollapsed, sidebarWidth, setSidebarCollapsed, setSidebarWidth, toggleSidebar, setBlankWorkspaceOk } =
    useUiStore();
  // Explicit "leave this project" (VS Code File → Open Folder): back to the
  // entry gate, where another project is opened. Never a casual side effect.
  const switchProject = () => {
    setBlankWorkspaceOk(false);
    closeProject();
    navigate("/live");
  };
  // While dragging, the live width lives here; the store (and localStorage)
  // are only written on pointer-up.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragging = dragWidth !== null;

  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragWidth(sidebarWidth);
  };

  const onDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // The sidebar starts at the window's left edge, so clientX is the width.
    const x = e.clientX;
    if (x < COLLAPSE_BELOW) {
      if (!sidebarCollapsed) setSidebarCollapsed(true);
      return;
    }
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setDragWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, x)));
  };

  const onDividerPointerUp = () => {
    if (!dragging) return;
    setSidebarWidth(dragWidth);
    setDragWidth(null);
  };

  const startNew = () => {
    // A new conversation needs a model. Before setup, route to the guide
    // instead of a dead live page — the examples stay browsable, but acting
    // (a real chat) is what asks the user to connect a provider.
    if (setupNeeded === true) {
      navigate("/setup");
      return;
    }
    startDraft();
    navigate("/live");
  };

  // History belongs to the OPEN FOLDER (VS Code model): a conversation lives in
  // the project it was created in, so the list shows only sessions whose folder
  // is the current workspace. An empty project shows no history — exactly like
  // opening a fresh folder. `workspace` null (browser / not yet connected) can't
  // scope, so it falls back to showing everything.
  const scope = (workspace ?? "").replace(/\/+$/, "");
  const inScope = (dir: string | undefined) => !scope || (dir ?? "").replace(/\/+$/, "") === scope;
  const rows: Row[] = [
    // Subagent child sessions are internals of their parent conversation —
    // their asks and progress surface there, so they get no row of their own.
    ...sessions
      .filter((s) => !s.parentId && inScope(s.directory))
      .map((s) => ({ id: s.id, title: s.title, to: `/live/${s.id}`, kind: "session" as const })),
    // Bundled demo conversations aren't bound to a user folder — they belong to
    // the blank/no-project state, not inside someone's project. Hide them once a
    // real project is open so the history is purely that folder's.
    ...(workspacePinned
      ? []
      : project.sessions
          .filter((e) => !hiddenExamples.includes(e.id))
          .map((e) => ({ id: e.id, title: e.title, to: `/example/${e.id}`, kind: "example" as const }))),
  ];

  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  // The bottom-left gear's menu (settings / setup / feedback / status).
  const [gearOpen, setGearOpen] = useState(false);
  // Top-row session search (CS grammar: the magnifier beside the name).
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // The magnifier's filter — title match, case-insensitive.
  const visibleRows = query.trim()
    ? rows.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()))
    : rows;
  const gearRef = useRef<HTMLDivElement>(null);
  const gearBtnRef = useRef<HTMLButtonElement>(null);
  // The menu is portalled to document.body, so it is NOT a DOM descendant of
  // gearRef — a mousedown inside it counts as "outside" and would close the
  // menu before the item's click fires, killing every item. Track the menu
  // node too so clicks inside it don't dismiss it.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!gearOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inGear = gearRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inGear && !inMenu) setGearOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGearOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [gearOpen]);

  const confirmDelete = () => {
    const row = pendingDelete;
    setPendingDelete(null);
    if (!row) return;
    if (row.kind === "session") void deleteSession(row.id);
    else hideExample(row.id);
    if (location.pathname === row.to) navigate("/live");
  };

  // With the overlay titlebar (macOS), reserve a draggable strip at the top so
  // the traffic lights don't overlap the logo and the window stays movable.
  const isMac = navigator.userAgent.includes("Mac");
  const overlayTitlebar = isTauri && isMac;

  const width = dragWidth ?? sidebarWidth;

  return (
    <div
      className={cn(
        "relative h-full shrink-0 overflow-hidden",
        !dragging && "transition-[width] duration-200 ease-out",
      )}
      style={{ width: sidebarCollapsed ? 0 : width }}
    >
      {/* Handoff: the sidebar is a FLOATING CARD on the app background — the
          aside is just the 8px gutter; the rail-card holds the content. */}
      <aside
        className={cn(
          "flex h-full flex-col pb-2 pl-2 pr-0",
          overlayTitlebar ? "pt-9" : "pt-2",
        )}
        style={{ width }}
        data-tauri-drag-region={overlayTitlebar || undefined}
      >
      <div className="flex h-full min-h-0 flex-col rounded-rail bg-rail-card px-1.5 pb-2.5 pt-1.5 shadow-rail">
      {/* Top row grammar: [brand + project name] [search] [collapse]. Like VS
          Code's title bar, the current PROJECT name sits here; once a project is
          open the row is a button that returns to the gate to open another. */}
      <div className="flex items-center gap-px px-0.5 pt-1">
        {workspacePinned ? (
          <button
            onClick={switchProject}
            className="group flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[7px] px-1.5 text-left text-[14px] font-medium text-text-000 hover:bg-bg-300"
            title={`${workspace ?? ""} — ${t("Open another project")}`}
          >
            <img src={mark} alt="Fishes" className="h-[17px] w-[17px] shrink-0 dark:hidden" />
            <img src={markReversed} alt="Fishes" className="hidden h-[17px] w-[17px] shrink-0 dark:block" />
            <span className="min-w-0 flex-1 truncate">{baseName(workspace)}</span>
            <AChevronDown size={13} className="shrink-0 text-text-300 opacity-0 group-hover:opacity-100" />
          </button>
        ) : (
          <div
            className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[7px] px-1.5 text-left text-[14px] font-medium text-text-000"
            title="Fishes"
          >
            <img src={mark} alt="Fishes" className="h-[17px] w-[17px] shrink-0 dark:hidden" />
            <img src={markReversed} alt="Fishes" className="hidden h-[17px] w-[17px] shrink-0 dark:block" />
            <span className="min-w-0 flex-1 truncate">Fishes</span>
          </div>
        )}
        <button
          onClick={() => setSearchOpen((o) => !o)}
          aria-label={t("Search sessions")}
          className="flex h-7 w-7 items-center justify-center rounded-[7px] text-text-300 transition-colors hover:bg-bg-300 hover:text-text-100"
        >
          <ASearch size={16} />
        </button>
        <button
          onClick={toggleSidebar}
          aria-label={t("Collapse sidebar")}
          title={`${t("Collapse sidebar")} (${isMac ? "⌘B" : "Ctrl+B"})`}
          className="flex h-7 w-7 items-center justify-center rounded-[7px] text-text-300 transition-colors hover:bg-bg-300 hover:text-text-100"
        >
          <APanel size={16} />
        </button>
      </div>

      <nav className="mt-3 flex flex-col gap-px">
        <NavRow icon={<APlus size={18} />} label={t("New")} onClick={startNew} />
        <NavRow icon={<ANotebook size={18} />} label={t("Notebooks")} onClick={() => navigate("/notebooks")} />
        <NavRow icon={<ABook size={18} />} label={t("Literature")} onClick={() => navigate("/literature")} />
        <NavRow icon={<AFile size={18} />} label={t("Files")} onClick={() => navigate("/files")} />
        <NavRow icon={<ACustomize size={18} />} label={t("Skills")} onClick={() => navigate("/skills")} />
      </nav>

      <div className="mx-2 my-2 h-px bg-border-300/70" />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {searchOpen && (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                setSearchOpen(false);
              }
            }}
            placeholder={t("Search sessions")}
            className="mx-2 mb-1.5 rounded-input border border-border-300 bg-bg-000 px-2.5 py-1.5 text-[13px] text-text-000 outline-none placeholder:text-text-400 focus:border-clay/60"
          />
        )}
        <div className="mx-2.5 mb-1.5 mt-0.5 text-[11px] font-medium text-text-300">{t("History")}</div>
        <div className="flex flex-col gap-px overflow-y-auto px-0.5">
        {visibleRows.length === 0 && (
          <div className="px-2.5 py-2 text-[13px] text-text-400">{t("No conversations yet.")}</div>
        )}
        {visibleRows.map((row) => {
          const activeRow = location.pathname === row.to;
          return (
          <div key={row.to} className="group relative">
            <NavLink
              to={row.to}
              className={cn(
                "flex h-8 items-center gap-1 rounded-input py-0 pl-2 pr-8 text-[14px] font-medium transition-colors",
                activeRow ? "bg-bg-300 text-text-000" : "text-text-200 hover:bg-bg-300",
              )}
            >
              {/* Live Claude Science uses a quiet HOLLOW ring, not a filled
                  colored dot — reads far more refined / less noisy. */}
              <span
                className={cn(
                  "mr-1 h-[7px] w-[7px] shrink-0 rounded-full border",
                  row.kind === "example" ? "border-text-400" : "border-mineral",
                )}
              />
              <span className="flex-1 truncate">{row.title}</span>
              {row.kind === "example" && (
                <span className="shrink-0 rounded-full bg-bg-200 px-1.5 text-[10px] uppercase tracking-wide text-text-400 ring-1 ring-border">
                  {t("example")}
                </span>
              )}
            </NavLink>
            <button
              onClick={() => setPendingDelete(row)}
              aria-label={`${t("Delete")} ${row.title}`}
              className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-text-400 hover:bg-bg-400 hover:text-error group-hover:block"
            >
              <Trash2 size={13} />
            </button>
          </div>
          );
        })}
        </div>
      </div>

      {/* Bottom-left grammar: one gear. Everything utility lives in its menu —
          setup guide, feedback, runtime status — never as text rows. */}
      <div className="mt-1.5" ref={gearRef}>
        {gearOpen &&
          createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t("Settings")}
            // Portalled to the body and fixed above the gear: a menu absolutely
            // positioned inside the sidebar paints under the main pane (which is
            // a later flex sibling), so the conversation covered it. The gear's
            // rect anchors it; body-level fixed clears every stacking context.
            style={{
              left: (gearBtnRef.current?.getBoundingClientRect().left ?? 12),
              bottom:
                window.innerHeight -
                (gearBtnRef.current?.getBoundingClientRect().top ?? window.innerHeight) +
                6,
            }}
            className="fixed z-[100] w-64 rounded-[14px] border border-border bg-bg-000 p-1.5 shadow-pop"
          >
            <div className="px-2 pb-1.5 pt-1">
              <StatusPills />
            </div>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[14px] text-text-000 hover:bg-bg-200"
              onClick={() => {
                setGearOpen(false);
                navigate("/settings");
              }}
            >
              <ASettings size={15} className="text-muted" />
              <span>{t("Settings")}</span>
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[14px] text-text-000 hover:bg-bg-200"
              onClick={() => {
                setGearOpen(false);
                navigate("/permissions");
              }}
            >
              <ShieldCheck size={15} className="text-muted" />
              <span>{t("Permissions")}</span>
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[14px] text-text-000 hover:bg-bg-200"
              onClick={() => {
                setGearOpen(false);
                navigate("/setup");
              }}
            >
              <Wrench size={15} className="text-muted" />
              <span>{t("Setup")}</span>
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[14px] text-text-000 hover:bg-bg-200"
              onClick={() => {
                setGearOpen(false);
                void openFeedback();
              }}
              title={t("Opens a prefilled report — a screenshot plus one sentence is enough.")}
            >
              <MessageSquareWarning size={15} className="text-muted" />
              <span>{t("Report a problem")}</span>
            </button>
          </div>,
          document.body,
        )}
        <button
          ref={gearBtnRef}
          onClick={() => setGearOpen((o) => !o)}
          aria-label={t("Settings")}
          aria-expanded={gearOpen}
          className="flex h-8 w-8 items-center justify-center rounded-input text-text-300 transition-colors hover:bg-bg-300 hover:text-text-100"
        >
          <ASettings size={18} />
        </button>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === "session" ? t("Delete session?") : t("Hide example?")}
          body={
            pendingDelete.kind === "session"
              ? `"${pendingDelete.title}" ${t("and its messages will be deleted. This cannot be undone.")}`
              : `"${pendingDelete.title}" ${t("will be hidden from the sidebar.")}`
          }
          confirmLabel={pendingDelete.kind === "session" ? t("Delete") : t("Hide")}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      </div>
      </aside>

      {/* Drag divider: resize within [SIDEBAR_MIN, SIDEBAR_MAX]; dragging far
          left snaps the sidebar closed. Kept mounted while collapsed so an
          in-flight drag (pointer capture) can re-open it. */}
      <div
        onPointerDown={onDividerPointerDown}
        onPointerMove={onDividerPointerMove}
        onPointerUp={onDividerPointerUp}
        onPointerCancel={onDividerPointerUp}
        className={cn(
          "group absolute inset-y-0 right-0 z-10 w-[5px] cursor-col-resize",
          sidebarCollapsed && !dragging && "pointer-events-none",
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 right-0 w-[2px] transition-colors",
            dragging ? "bg-accent/60" : "bg-transparent group-hover:bg-accent/40",
          )}
        />
      </div>
    </div>
  );
}

function NavRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded-input px-2 text-[14px] text-text-000 transition-colors hover:bg-bg-300"
    >
      <span className="shrink-0 text-text-100">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
