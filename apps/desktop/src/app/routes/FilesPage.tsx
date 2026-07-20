import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Dna,
  FileSearch,
  FileText,
  FlaskConical,
  FolderOpen,
  Image as ImageIcon,
  Highlighter,
  type LucideIcon,
  NotebookPen,
  RefreshCw,
  Sheet,
} from "lucide-react";
import { AArrowLeft, AClose, AFolder, ARefresh } from "@/components/icons/anthropic";
import { extOf, extToKind, previewKindForName, type PreviewKind } from "@/lib/artifacts";
import { listDir, type DirEntry } from "@/lib/artifactFile";
import { isTauri, workspaceBase } from "@/lib/tauri";
import { useRuntimeStore } from "@/lib/runtime";
import { baseName } from "@/components/thread/WorkspaceChip";
import { NotebookEditor } from "@/components/notebook/NotebookEditor";
import { FilePreviewInspector } from "@/components/inspector/FilePreviewInspector";
import { PaneTitlebarInset } from "@/components/inspector/RightPane";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

const EXT_LANG: Record<string, string> = {
  py: "python", r: "r", jl: "julia", sh: "bash", tex: "latex", md: "markdown",
};

function iconFor(entry: DirEntry) {
  // Handoff: folders carry a warm brass tint; files are quiet text-300.
  if (entry.isDir) return <AFolder size={16} className="text-[#b79b5f]" />;
  const kind = previewKindForName(entry.name);
  const cls = "text-text-300";
  if (entry.name.endsWith(".ipynb")) return <NotebookPen size={15} className={cls} />;
  if (kind === "image" || kind === "fits" || kind === "anomaly" || kind === "phase") return <ImageIcon size={15} className={cls} />;
  if (kind === "table") return <Sheet size={15} className={cls} />;
  if (kind === "molecule" || kind === "dos" || kind === "bands") return <FlaskConical size={15} className={cls} />;
  if (kind === "genome") return <Dna size={15} className={cls} />;
  if (kind === "qcode") return <Highlighter size={15} className={cls} />;
  return <FileText size={15} className={cls} />;
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "75d" / "3h" / "12m" — the age column, coarse on purpose. */
function humanAge(epochSecs: number): string {
  const s = Math.max(0, Date.now() / 1000 - epochSecs);
  const d = Math.floor(s / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(s / 60);
  return m >= 1 ? `${m}m` : "now";
}

/** The list as a quiet table: icon + name, right-aligned size and age in
 *  fixed gutters, hairline separators. Directories navigate, files preview. */
function FileTable({
  entries,
  selectedPath,
  onOpen,
}: {
  entries: DirEntry[];
  selectedPath?: string | null;
  onOpen: (entry: DirEntry) => void;
}) {
  return (
    <div className="px-2 pb-2">
      {entries.map((entry) => (
        <button
          key={entry.path}
          onClick={() => onOpen(entry)}
          className={cn(
            "flex h-[52px] w-full items-center gap-3 rounded-input border-b border-border px-3.5 text-left transition-colors hover:bg-bg-200",
            selectedPath === entry.path && "bg-bg-200",
          )}
        >
          {iconFor(entry)}
          <span className="min-w-0 flex-1 truncate text-[15px] text-text-000">{entry.name}</span>
          <span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-text-300">
            {entry.isDir ? "—" : humanSize(entry.size)}
          </span>
          <span className="w-9 shrink-0 text-right text-[13px] tabular-nums text-text-400">
            {humanAge(entry.modified)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Content-shaped loading placeholder for the file list — skeleton rows that
 *  keep the list's shape while it loads, instead of a bare spinner. */
function FileListSkeleton() {
  const widths = ["w-2/3", "w-1/2", "w-3/4", "w-5/6", "w-1/2", "w-2/3", "w-3/5"];
  return (
    <div className="px-3.5 pt-1" aria-hidden>
      {widths.map((w, i) => (
        <div key={i} className="flex h-[52px] items-center gap-3">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-bg-300" />
          <div className={cn("h-3.5 animate-pulse rounded bg-bg-300", w)} />
        </div>
      ))}
    </div>
  );
}

/** Structured empty state: a centered icon + title + optional body, sized to an
 *  h-64 box (CS's empty-state grammar) instead of a bare muted one-liner. */
function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon size={28} strokeWidth={1.5} className="text-text-400" />
      <div className="text-[13px] font-medium text-text-200">{title}</div>
      {body && <div className="max-w-[420px] text-[12px] leading-relaxed text-text-400">{body}</div>}
    </div>
  );
}

/** Danger-tinted card for a folder that failed to load: what happened (the raw
 *  error, demoted) + how to fix it (retry). Icon + text prefix keep it from
 *  being color-only (DESIGN_GUIDELINES 15 & 20). */
function FolderLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex min-h-64 items-start justify-center p-4">
      <div className="w-full max-w-[420px] rounded-card border border-error/30 bg-error/10 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-error">
          <AlertTriangle size={15} className="shrink-0" /> {t("Couldn't open this folder")}
        </div>
        <p className="mb-3 break-words text-[13px] text-text-200">{message}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-input border border-border bg-surface px-2.5 py-1.5 text-[13px] text-text hover:bg-surface-2"
        >
          <RefreshCw size={13} /> {t("Try again")}
        </button>
      </div>
    </div>
  );
}

/** CS-style location bar: up one level, a "Go to" label, the full path in a
 *  mono field, and refresh. The path is the truth of where you are. */
function PathBar({
  atRoot,
  fullPath,
  onUp,
  onRefresh,
}: {
  atRoot: boolean;
  fullPath: string;
  onUp: () => void;
  onRefresh: () => void;
}) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-2.5 px-3.5 py-2.5">
      <button
        onClick={onUp}
        disabled={atRoot}
        aria-label={t("Up one level")}
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-input text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100 disabled:opacity-40"
      >
        <AArrowLeft size={16} />
      </button>
      <span className="shrink-0 text-[14px] font-medium text-text-100">{t("Go to")}</span>
      <span
        className="flex h-[34px] min-w-0 flex-1 items-center truncate rounded-input border border-border-300 bg-bg-000 px-3 text-[12.5px] text-text-200"
        title={fullPath}
      >
        {fullPath}
      </span>
      <button
        onClick={onRefresh}
        aria-label={t("Refresh")}
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-input text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
      >
        <ARefresh size={15} />
      </button>
    </div>
  );
}

/**
 * GLOBAL file explorer: browses from the base folder (Settings → Workspace),
 * which holds every session's dated folder — not the active session only.
 * Directories are navigable via a breadcrumb; files open in the same viewers
 * used elsewhere (figures, tables, PDF, molecule, genome tracks, notebooks),
 * so all past work is reachable in one place.
 */
export function FilesPage() {
  const t = useT();
  const [dir, setDir] = useState(""); // project-relative; "" = the project root
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DirEntry | null>(null);
  // Files list the OPEN PROJECT (workspace), like VS Code's explorer — not the
  // whole base folder. `root: "workspace"` resolves to the active project; the
  // crumb shows its name. Blank workspace falls back to the base.
  const workspace = useRuntimeStore((s) => s.workspace);
  const [basePath, setBasePath] = useState<string | null>(null);
  useEffect(() => {
    if (workspace) setBasePath(workspace);
    else void workspaceBase().then(setBasePath).catch(() => {});
  }, [workspace]);

  const load = useCallback(async (rel: string) => {
    setEntries(null);
    setError(null);
    try {
      setEntries(await listDir(rel, "workspace"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntries([]);
    }
  }, []);

  // Reset to the root and reload whenever the open project changes.
  useEffect(() => {
    setSelected(null);
    setDir("");
  }, [workspace]);

  useEffect(() => {
    void load(dir);
  }, [dir, load, workspace]);

  const open = (entry: DirEntry) => {
    if (entry.isDir) {
      setSelected(null);
      setDir(entry.path);
    } else {
      setSelected(entry);
    }
  };

  const crumbs = dir ? dir.split("/") : [];

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[380px] shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-2.5">
          <span className="inline-flex max-w-full items-center gap-2 rounded-[9px] border border-border-300 bg-bg-000 px-3 py-2 text-[14px] font-medium text-text-000">
            <AFolder size={16} className="shrink-0 text-[#b79b5f]" />
            <span className="truncate" title={basePath ?? undefined}>{baseName(basePath)}</span>
          </span>
        </div>
        <PathBar
          atRoot={!dir}
          fullPath={[basePath ?? "", dir].filter(Boolean).join("/")}
          onUp={() => setDir(crumbs.slice(0, -1).join("/"))}
          onRefresh={() => void load(dir)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries === null && <FileListSkeleton />}
          {error && <FolderLoadError message={error} onRetry={() => void load(dir)} />}
          {entries && entries.length === 0 && !error && (
            <EmptyState
              icon={FolderOpen}
              title={isTauri ? t("This folder is empty") : t("Available in the desktop app")}
              body={
                isTauri
                  ? t("Files your work produces will appear here.")
                  : t("The file explorer runs in the desktop app.")
              }
            />
          )}
          {entries && entries.length > 0 && (
            <FileTable entries={entries} selectedPath={selected?.path} onOpen={open} />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {selected ? (
          <FilePreview key={selected.path} entry={selected} root="workspace" onClose={() => setSelected(null)} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={FileSearch}
              title={t("No file selected")}
              body={t("Select a file to preview it here.")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FilePreview({
  entry,
  root,
  onClose,
  controls,
}: {
  entry: DirEntry;
  root: "workspace" | "base";
  onClose: () => void;
  controls?: React.ReactNode;
}) {
  const ext = extOf(entry.name);
  if (ext === "ipynb")
    return <NotebookEditor path={entry.path} root={root} onClose={onClose} controls={controls} />;
  const kind: PreviewKind = previewKindForName(entry.name);
  return (
    <FilePreviewInspector
      data={{
        variant: "file",
        path: entry.path,
        filename: entry.name,
        artifact: extToKind(ext),
        language: EXT_LANG[ext] ?? (kind === "text" ? ext : undefined),
        root,
      }}
      onClose={onClose}
      controls={controls}
    />
  );
}

/**
 * Compact browser for the CURRENT session's folder, shown in the right
 * inspector pane beside the conversation (the session-scoped quick entry —
 * the Files page itself is global). Clicking a file swaps the pane to its
 * preview; closing the preview returns to the list.
 */
export function SessionFilesPane({
  onClose,
  controls,
}: {
  onClose: () => void;
  /** Pane-level header buttons (e.g. maximize), rendered before Close. */
  controls?: React.ReactNode;
}) {
  const t = useT();
  const workspace = useRuntimeStore((s) => s.workspace);
  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DirEntry | null>(null);
  // Bumped to re-run the listing on demand (refresh / retry) even when dir and
  // workspace are unchanged.
  const [reload, setReload] = useState(0);

  // A session switch moves the active folder — restart at its root.
  useEffect(() => {
    setSelected(null);
    setDir("");
  }, [workspace]);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    listDir(dir, "workspace")
      .then((e) => {
        if (!cancelled) setEntries(e);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dir, workspace, reload]);

  if (selected) {
    return (
      <FilePreview
        entry={selected}
        root="workspace"
        onClose={() => setSelected(null)}
        controls={controls}
      />
    );
  }

  const crumbs = dir ? dir.split("/") : [];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <PaneTitlebarInset />
        <button
          onClick={() => setDir("")}
          className="flex min-w-0 items-center gap-2 rounded-input px-1.5 py-1 hover:bg-bg-200"
          title={workspace ?? undefined}
        >
          <AFolder size={15} strokeWidth={1.5} className="shrink-0 text-[#b79b5f]" />
          <span className="truncate text-[14px] font-medium text-text-000">{baseName(workspace)}</span>
        </button>
        <div className="flex-1" />
        {controls}
        <button className="flex h-[30px] w-[30px] items-center justify-center rounded-input text-text-300 hover:bg-bg-200 hover:text-text-100" aria-label={t("Close files")} onClick={onClose}>
          <AClose size={15} strokeWidth={1.5} />
        </button>
      </div>
      <PathBar
        atRoot={!dir}
        fullPath={[workspace ?? "", dir].filter(Boolean).join("/")}
        onUp={() => setDir(crumbs.slice(0, -1).join("/"))}
        onRefresh={() => setReload((n) => n + 1)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries === null && <FileListSkeleton />}
        {error && <FolderLoadError message={error} onRetry={() => setReload((n) => n + 1)} />}
        {entries && entries.length === 0 && !error && (
          <EmptyState
            icon={FolderOpen}
            title={t("This folder is empty")}
            body={t("Files this session produces will appear here.")}
          />
        )}
        {entries && entries.length > 0 && (
          <FileTable
            entries={entries}
            onOpen={(entry) => (entry.isDir ? setDir(entry.path) : setSelected(entry))}
          />
        )}
      </div>
    </div>
  );
}
