import { useEffect } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import {
  FileSearch,
  Moon,
  NotebookPen,
  PackagePlus,
  Plus,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/lib/store";
import { useRuntimeStore } from "@/lib/runtime";
import { useT } from "@/lib/i18n";
import { WORKFLOW_STARTERS } from "@/components/thread/WorkflowStarters";

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Prompt for a starter workflow by id, so ⌘K and the empty-session cards stay in sync. */
const starterPrompt = (id: string) => WORKFLOW_STARTERS.find((s) => s.id === id)?.prompt ?? "";

export function CommandPalette() {
  const t = useT();
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useUiStore.getState().paletteOpen);
      }
      // Consume Esc only when the palette is open — a marked-handled Esc must
      // not also interrupt a running agent turn (LiveSessionPage listens too).
      if (e.key === "Escape" && useUiStore.getState().paletteOpen) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const close = () => setOpen(false);

  // Start a new session and send a workflow prompt, then reveal that session.
  // Before setup, both paths lead to the guide — a workflow can't run without
  // a connected model.
  const runWorkflow = async (starterId: string) => {
    close();
    if (useRuntimeStore.getState().setupNeeded === true) {
      navigate("/setup");
      return;
    }
    useRuntimeStore.getState().startDraft();
    const id = await useRuntimeStore.getState().sendPrompt(starterPrompt(starterId));
    if (id) navigate(`/live/${id}`);
  };

  const startNew = () => {
    close();
    if (useRuntimeStore.getState().setupNeeded === true) {
      navigate("/setup");
      return;
    }
    useRuntimeStore.getState().startDraft();
    navigate("/live");
  };

  const actions: Action[] = [
    { id: "new", label: t("New session"), icon: <Plus size={16} />, run: startNew },
    { id: "analyze", label: t("Analyze my data (new workflow)"), icon: <FileSearch size={16} />, run: () => void runWorkflow("analyze") },
    { id: "review", label: t("Audit a report (traceability review)"), icon: <ShieldCheck size={16} />, run: () => void runWorkflow("audit") },
    { id: "notebooks", label: t("Open notebooks"), icon: <NotebookPen size={16} />, run: () => { navigate("/notebooks"); close(); } },
    { id: "skills", label: t("Manage skills"), icon: <PackagePlus size={16} />, run: () => { navigate("/skills"); close(); } },
    { id: "settings", label: t("Open settings"), icon: <Settings size={16} />, run: () => { navigate("/settings"); close(); } },
    { id: "theme", label: t("Toggle light / dark theme"), icon: <Moon size={16} />, run: () => { toggleTheme(); close(); } },
  ];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[16vh]"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-[calc(100vw-2rem)]"
      >
        <Command
          label={t("Command palette")}
          className="overflow-hidden rounded-card border border-border bg-surface shadow-pop"
        >
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search size={18} className="shrink-0 text-muted" />
            <Command.Input
              autoFocus
              placeholder={t("Type a command…")}
              className="w-full bg-transparent py-3 text-[16px] text-text outline-none placeholder:text-muted"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
              {t("No results.")}
            </Command.Empty>
            {actions.map((a) => (
              <Command.Item
                key={a.id}
                value={a.label}
                onSelect={a.run}
                className="flex cursor-pointer items-center gap-3 rounded-input px-3 py-2 text-sm text-text data-[selected=true]:bg-surface-2"
              >
                <span className="text-muted">{a.icon}</span>
                {a.label}
              </Command.Item>
            ))}
          </Command.List>
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <Kbd>↑↓</Kbd>
              {t("navigate")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              {t("open")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>esc</Kbd>
              {t("close")}
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

/** Bordered keycap chip for the palette's keyboard-hint footer. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "rounded border border-border bg-surface-2 px-1 py-0.5",
        "font-sans text-[11px] leading-none text-muted",
      )}
    >
      {children}
    </kbd>
  );
}
