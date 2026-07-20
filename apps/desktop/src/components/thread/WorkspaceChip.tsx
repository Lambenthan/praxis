import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderOpen, FolderPlus, Laptop } from "lucide-react";
import { isTauri, pickFolder } from "@/lib/tauri";
import { datedWorkspaceName, useRuntimeStore } from "@/lib/runtime";
import { getRecentWorkspaces, pushRecentWorkspace } from "@/lib/recentWorkspaces";
import { t, useT } from "@/lib/i18n";

/** Last path segment of the workspace folder, or "Workspace" when unknown. */
export function baseName(path: string | null): string {
  if (!path) return t("Workspace");
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || t("Workspace");
}

/** The workspace path with the home directory shown as `~`, so the header can
 *  display where the files are (e.g. `~/Desktop/耐心资本测试`) at a glance. */
export function abbrevHome(path: string | null): string {
  if (!path) return t("Workspace");
  return path
    .replace(/^\/Users\/[^/]+/, "~")
    .replace(/^\/home\/[^/]+/, "~")
    .replace(/^C:\\Users\\[^\\]+/i, "~");
}

/**
 * Folder picker for a fresh draft, shown in the session header next to the
 * title. A draft starts in a new dated folder by default — the chip opens the
 * native picker for anyone who wants a specific folder instead (the pick pins
 * it). Once the session exists its folder is a fact, not a choice — the
 * header's Files toggle names it, so the chip disappears.
 */
export function WorkspaceChip() {
  const t = useT();
  const workspace = useRuntimeStore((s) => s.workspace);
  const currentId = useRuntimeStore((s) => s.currentId);
  const workspacePinned = useRuntimeStore((s) => s.workspacePinned);
  const switchWorkspace = useRuntimeStore((s) => s.switchWorkspace);
  const sending = useRuntimeStore((s) => s.sending);
  const [busy, setBusy] = useState(false);

  if (!isTauri || currentId) return null;

  const choose = async () => {
    const dir = await pickFolder();
    if (!dir) return; // cancelled — keep the current destination
    setBusy(true);
    try {
      await switchWorkspace({ path: dir }); // an explicit pick pins the folder
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="flex items-center gap-1 rounded-input px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text disabled:opacity-60"
      onClick={() => void choose()}
      disabled={busy || sending}
      title={
        workspacePinned
          ? `${workspace ?? ""} ${t("— click to choose a different folder")}`
          : `${t("Starts in a new dated folder")} (${datedWorkspaceName()}) ${t("— click to choose a folder instead")}`
      }
      aria-label={t("Choose session folder")}
    >
      <FolderOpen size={14} className="shrink-0" />
      {busy ? (
        <span>{t("Switching…")}</span>
      ) : (
        workspacePinned && <span className="max-w-[200px] truncate">{baseName(workspace)}</span>
      )}
    </button>
  );
}

/**
 * The chip row above the composer input (Claude Science layout): a "Local"
 * indicator (everything runs on this machine), the working folder, and — for a
 * fresh draft — an add-folder button that picks the session's folder. Once the
 * session exists its folder is a fact, so the folder chip is a static label and
 * the picker is gone.
 */
export function WorkspaceBar() {
  const t = useT();
  const workspace = useRuntimeStore((s) => s.workspace);
  const currentId = useRuntimeStore((s) => s.currentId);
  const workspacePinned = useRuntimeStore((s) => s.workspacePinned);
  const switchWorkspace = useRuntimeStore((s) => s.switchWorkspace);
  const sending = useRuntimeStore((s) => s.sending);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setRecents(getRecentWorkspaces());
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!isTauri) return null;

  // Enter a project = point the workspace at its folder (and remember it).
  const enter = async (dir: string) => {
    setOpen(false);
    setBusy(true);
    try {
      await switchWorkspace({ path: dir });
      pushRecentWorkspace(dir);
    } finally {
      setBusy(false);
    }
  };
  const openNative = async () => {
    setOpen(false);
    const dir = await pickFolder();
    if (dir) await enter(dir);
  };

  // VS-Code-style lock: you choose a project folder ONCE (when none is pinned);
  // after that the workspace is fixed and the chip is a static label — no casual
  // mid-work switching, which only disorients non-technical researchers. To move
  // to another project you go back through the entry gate.
  const unlocked = !currentId && !workspacePinned;
  const folderLabel = unlocked ? datedWorkspaceName() : baseName(workspace);

  const chip = "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[13px] text-text";

  return (
    <div className="mb-2 flex items-center gap-1.5 px-0.5">
      <span className={chip} title={t("Everything runs on this computer")}>
        <Laptop size={14} className="shrink-0 text-muted" />
        {t("Local")}
      </span>
      {unlocked ? (
        // No project chosen yet → the picker: Recent projects + Open folder…
        <div ref={ref} className="relative">
          <button
            className={`${chip} hover:bg-surface-2 disabled:opacity-60`}
            onClick={() => setOpen((o) => !o)}
            disabled={busy || sending}
            title={
              workspacePinned
                ? abbrevHome(workspace)
                : t("Starts in a new dated folder — pick a project folder to work in")
            }
            aria-label={t("Choose a project folder")}
          >
            <FolderOpen size={14} className="shrink-0 text-muted" />
            <span className="max-w-[220px] truncate">{busy ? t("Switching…") : folderLabel}</span>
            <ChevronDown size={12} className="shrink-0 text-muted" />
          </button>
          {open && (
            <div className="absolute bottom-full left-0 z-50 mb-1.5 w-64 rounded-card border border-border bg-surface p-1 shadow-pop">
              {recents.length > 0 && (
                <>
                  <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted">
                    {t("Recent")}
                  </div>
                  {recents.map((p) => (
                    <button
                      key={p}
                      onClick={() => void enter(p)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-text hover:bg-surface-2"
                      title={abbrevHome(p)}
                    >
                      <FolderOpen size={13} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{baseName(p)}</span>
                      {p === workspace && <Check size={13} className="shrink-0 text-accent" />}
                    </button>
                  ))}
                  <div className="my-1 border-t border-border" />
                </>
              )}
              <button
                onClick={() => void openNative()}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-text hover:bg-surface-2"
              >
                <FolderPlus size={13} className="shrink-0 text-muted" />
                {t("Open folder…")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <span className={chip} title={abbrevHome(workspace)}>
          <FolderOpen size={14} className="shrink-0 text-muted" />
          <span className="max-w-[240px] truncate">{baseName(workspace)}</span>
        </span>
      )}
    </div>
  );
}
