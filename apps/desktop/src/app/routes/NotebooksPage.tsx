import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, NotebookPen, Plus } from "lucide-react";
import { addTextToWorkspace, isTauri } from "@/lib/tauri";
import { listNotebooks, type NotebookEntry } from "@/lib/artifactFile";
import { emptyIpynb } from "@/lib/notebook-file";
import type { KernelLanguage } from "@/lib/kernel";
import { NotebookEditor } from "@/components/notebook/NotebookEditor";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";

/** "75d" / "3h" / "12m" — the age column, coarse on purpose (same as FilesPage). */
function humanAge(epochSecs: number): string {
  const s = Math.max(0, Date.now() / 1000 - epochSecs);
  const d = Math.floor(s / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(s / 60);
  return m >= 1 ? `${m}m` : "now";
}

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
      <div className="mx-auto max-w-2xl px-8 pb-16 pt-10">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
              {t("Workspace")}
            </div>
            <h1 className="mt-2 font-serif text-[22px] leading-tight text-text">{t("Notebooks")}</h1>
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              className="flex h-9 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={!isTauri}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Plus size={14} /> {t("New notebook")} <ChevronDown size={13} className="opacity-80" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-1 w-44 rounded-card border border-border bg-surface p-1 shadow-pop"
              >
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-[15px] text-text hover:bg-surface-2"
                  onClick={() => void createNew("python")}
                >
                  <NotebookPen size={13} className="text-muted" /> {t("Python notebook")}
                </button>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-[15px] text-text hover:bg-surface-2"
                  onClick={() => void createNew("r")}
                >
                  <NotebookPen size={13} className="text-muted" /> {t("R notebook")}
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t(
            "All Jupyter notebooks across your session folders, newest first. Cells run on the local Python or R kernel in the notebook's own folder; the agent works on the same files.",
          )}
        </p>

        {entries.length === 0 ? (
          <div className="mt-6 rounded-card border border-border bg-surface p-5 text-sm text-muted shadow-card">
            {isTauri
              ? t("No notebooks yet. Create one, or ask the agent to produce one.")
              : t("Notebooks are available in the desktop app.")}
          </div>
        ) : (
          /* The list as a quiet table (FilesPage idiom): icon + name, the
             session folder and age right-aligned in muted 12px, hairline
             separators inside one card. */
          <div className="mt-6 divide-y divide-faint overflow-hidden rounded-card border border-border bg-surface shadow-card">
            {entries.map((e) => {
              const slash = e.path.lastIndexOf("/");
              const folder = slash >= 0 ? e.path.slice(0, slash) : "";
              const name = slash >= 0 ? e.path.slice(slash + 1) : e.path;
              return (
                <button
                  key={e.path}
                  onClick={() => setOpen({ path: e.path, root: "base" })}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[15px] text-text transition-colors hover:bg-surface-2"
                >
                  <NotebookPen size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {folder && (
                    <span className="max-w-[40%] shrink-0 truncate text-[12px] text-muted">
                      {folder}
                    </span>
                  )}
                  <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-muted">
                    {humanAge(e.modified)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
