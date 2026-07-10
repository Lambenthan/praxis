import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { isTauri, pickFolder } from "@/lib/tauri";
import { datedWorkspaceName, useRuntimeStore } from "@/lib/runtime";
import { t, useT } from "@/lib/i18n";

/** Last path segment of the workspace folder, or "Workspace" when unknown. */
export function baseName(path: string | null): string {
  if (!path) return t("Workspace");
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || t("Workspace");
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
