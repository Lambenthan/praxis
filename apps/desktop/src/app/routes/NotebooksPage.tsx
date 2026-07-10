import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, NotebookPen, Plus } from "lucide-react";
import { addTextToWorkspace, isTauri } from "@/lib/tauri";
import { listNotebooks, type NotebookEntry } from "@/lib/artifactFile";
import { emptyIpynb } from "@/lib/notebook-file";
import type { KernelLanguage } from "@/lib/kernel";
import { NotebookEditor } from "@/components/notebook/NotebookEditor";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";

/**
 * Notebooks live in session workspaces as real .ipynb files: the user runs
 * cells on the app's local kernel, and the agent reads/edits the same files —
 * that shared file is the collaboration surface. This page is GLOBAL: it lists
 * every notebook under the base folder, across all session folders, newest
 * first. A notebook's kernel always runs in the notebook's own folder.
 */
export function NotebooksPage() {
  const t = useT();
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  /** Open notebook + the tree its path resolves in ("base" = listed here;
   *  "workspace" = just created in the active session folder). */
  const [open, setOpen] = useState<{ path: string; root: "workspace" | "base" } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setEntries(await listNotebooks("base"));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Close the kernel menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const createNew = async (language: KernelLanguage) => {
    setMenuOpen(false);
    try {
      const base = language === "r" ? "notebook-r.ipynb" : "notebook.ipynb";
      const name = await addTextToWorkspace(base, emptyIpynb(language));
      await refresh();
      setOpen({ path: name, root: "workspace" });
    } catch (err) {
      toast.error(`${t("Could not create notebook:")} ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (open) {
    return (
      <NotebookEditor
        path={open.path}
        root={open.root}
        onBack={() => {
          setOpen(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-6">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl text-text">{t("Notebooks")}</h1>
          <div className="flex-1" />
          <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-1.5 rounded-input bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={!isTauri}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Plus size={13} /> {t("New notebook")} <ChevronDown size={12} className="opacity-80" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-card border border-border bg-surface py-1 shadow-lg"
              >
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-surface-2"
                  onClick={() => void createNew("python")}
                >
                  <NotebookPen size={13} className="text-muted" /> {t("Python notebook")}
                </button>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-surface-2"
                  onClick={() => void createNew("r")}
                >
                  <NotebookPen size={13} className="text-muted" /> {t("R notebook")}
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">
          {t(
            "All Jupyter notebooks across your session folders, newest first. Cells run on the local Python or R kernel in the notebook's own folder; the agent works on the same files.",
          )}
        </p>

        <div className="mt-5 space-y-1.5">
          {entries.length === 0 && (
            <div className="rounded-card border border-border bg-surface p-5 text-sm text-muted">
              {isTauri
                ? t("No notebooks yet. Create one, or ask the agent to produce one.")
                : t("Notebooks are available in the desktop app.")}
            </div>
          )}
          {entries.map((e) => {
            const slash = e.path.lastIndexOf("/");
            const folder = slash >= 0 ? e.path.slice(0, slash) : "";
            const name = slash >= 0 ? e.path.slice(slash + 1) : e.path;
            return (
              <button
                key={e.path}
                onClick={() => setOpen({ path: e.path, root: "base" })}
                className="flex w-full items-center gap-2.5 rounded-card border border-border bg-surface px-4 py-2.5 text-left hover:bg-surface-2"
              >
                <NotebookPen size={15} className="shrink-0 text-muted" />
                <span className="truncate text-sm text-text">{name}</span>
                {folder && (
                  <span className="max-w-[40%] truncate rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                    {folder}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {new Date(e.modified * 1000).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
