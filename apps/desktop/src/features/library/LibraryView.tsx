import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Copy,
  FileDown,
  FileText,
  Loader2,
  MoreHorizontal,
  Network,
  Paperclip,
  Plus,
  Quote,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ABook, ARefresh } from "@/components/icons/anthropic";
import { cn } from "@/lib/cn";
import { formatBibliography, type CitationStyle } from "@/lib/citation";
import { useT } from "@/lib/i18n";
import { saveTextFile } from "@/lib/tauri";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { stageAndGenerate, startLiteratureSearch } from "./generateWiki";
import { isIngested, loadIngestedTitles } from "@/lib/wikiIngested";
import {
  addDoi,
  addFiles,
  creatorsLabel,
  deleteItem,
  importZotero,
  loadLibrary,
  pickPdfs,
  setTrashed,
  zoteroAvailable,
  type LibItem,
  type Library,
} from "@/lib/library";
import { DetailPane } from "./DetailPane";
import { PdfReader } from "./PdfReader";
import { useRuntimeStore } from "@/lib/runtime";

type Scope = { kind: "all" } | { kind: "trash" };
type SortCol = "title" | "creators" | "year" | "added";

/**
 * The Zotero-style library manager: the item table on the left, the selected
 * item's metadata (or its PDF) on the right. One project = one library; the
 * old collections (sub-research) column is gone from the UI — the data layer
 * in src-tauri/src/library.rs keeps its tables untouched.
 */
export function LibraryView({
  onOpenChat,
  onGenerateStarted,
}: {
  onOpenChat?: () => void;
  /** A wiki generation was dispatched — the page watches the run and jumps
   *  to the Wiki tab when it completes. */
  onGenerateStarted?: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [lib, setLib] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [selKey, setSelKey] = useState<string | null>(null);
  // Multi-select (checkbox / cmd / shift) for bulk actions.
  const [selKeys, setSelKeys] = useState<string[]>([]);
  const [multiMode, setMultiMode] = useState(false);
  const lastClickRef = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; asc: boolean }>({ col: "added", asc: false });
  const [pdf, setPdf] = useState<{ key: string; relPath: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The workspace switch behind a project lock restarts the sidecar; surface it
  // so entering a project never looks frozen.
  const switching = useRuntimeStore((s) => s.switching);
  const [canImportZotero, setCanImportZotero] = useState(false);
  // The item table lives beside up to two fixed panes (detail, chat drawer)
  // — measure it and drop the Creator/Year columns when squeezed,
  // instead of letting fixed columns overlap. Callback ref, NOT a mount
  // effect: the table div doesn't exist during the loading state, so an
  // effect that ran once at mount observed nothing and compact never fired.
  const [tableEl, setTableEl] = useState<HTMLDivElement | null>(null);
  const [tableW, setTableW] = useState(9999);
  useEffect(() => {
    if (!tableEl || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver((es) => {
      for (const e of es) setTableW(e.contentRect.width);
    });
    obs.observe(tableEl);
    return () => obs.disconnect();
  }, [tableEl]);
  const compact = tableW < 380;
  const gridCols = compact
    ? "grid-cols-[18px_minmax(0,1fr)_20px]"
    : "grid-cols-[18px_minmax(0,1fr)_130px_52px_20px]";

  // Papers already in the project wiki (normalized titles + slugs from
  // wiki/papers/*.md) — rows get a quiet badge and generation skips them.
  const [ingestedTitles, setIngestedTitles] = useState<Set<string>>(new Set());
  const refreshIngested = useCallback(async () => {
    try {
      setIngestedTitles(await loadIngestedTitles());
    } catch {
      setIngestedTitles(new Set());
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      setLib(await loadLibrary());
    } catch {
      setLib(null);
    }
    // The wiki grows outside the app's command path (the conversation writes
    // it), so re-scan it whenever the library itself is re-read.
    void refreshIngested();
    setLoading(false);
  }, [refreshIngested]);

  useEffect(() => {
    void reload();
    void zoteroAvailable().then(setCanImportZotero);
  }, [reload]);

  // The library belongs to the open project: when the project (workspace)
  // changes, reload it and reset to the all-items view of the new project.
  const workspace = useRuntimeStore((s) => s.workspace);
  const firstWorkspace = useRef(true);
  useEffect(() => {
    if (firstWorkspace.current) {
      firstWorkspace.current = false;
      return;
    }
    setScope({ kind: "all" });
    setPdf(null);
    clearSelection();
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- realign only when the project changes
  }, [workspace]);

  // The conversation's import skill writes the library from outside the app's
  // command path — refresh whenever the user comes back to the window.
  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reload]);

  const say = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 6000);
  };

  /** Replace one item in place (edits) without a full reload. */
  const patchItem = (item: LibItem) => {
    setLib((l) =>
      l ? { ...l, items: l.items.map((i) => (i.key === item.key ? item : i)) } : l,
    );
  };

  const items = lib?.items ?? [];
  const selected = items.find((i) => i.key === selKey) ?? null;

  // Item keys already in the wiki — memoized: isIngested walks the title set,
  // so computing it per row per render would be quadratic on big libraries.
  const ingestedKeys = useMemo(() => {
    const out = new Set<string>();
    for (const i of items) if (isIngested(i.title, ingestedTitles)) out.add(i.key);
    return out;
  }, [items, ingestedTitles]);

  const visible = useMemo(() => {
    let list = items;
    if (scope.kind === "trash") list = list.filter((i) => i.trashed);
    else list = list.filter((i) => !i.trashed);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        [
          i.title,
          i.creators.map((c) => `${c.first} ${c.last}`).join(" "),
          String(i.year ?? ""),
          i.tags.join(" "),
          i.fields.publicationTitle ?? "",
          i.fields.DOI ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    const dir = sort.asc ? 1 : -1;
    const keyOf = (i: LibItem): string | number => {
      switch (sort.col) {
        case "title":
          return i.title.toLowerCase();
        case "creators":
          return creatorsLabel(i).toLowerCase();
        case "year":
          return i.year ?? 0;
        case "added":
          return i.dateAdded;
      }
    };
    return [...list].sort((a, b) => (keyOf(a) < keyOf(b) ? -dir : keyOf(a) > keyOf(b) ? dir : 0));
  }, [items, scope, query, sort]);

  const clickSort = (col: SortCol) =>
    setSort((s) => ({ col, asc: s.col === col ? !s.asc : col === "title" || col === "creators" }));

  // ── Multi-select + bulk filing ─────────────────────────────────────────────
  const clearSelection = () => {
    setSelKeys([]);
    setMultiMode(false);
  };
  const toggleCheck = (key: string) => {
    setMultiMode(true);
    setSelKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    lastClickRef.current = key;
  };
  const rowClick = (e: React.MouseEvent, key: string) => {
    if (e.metaKey || e.ctrlKey) {
      toggleCheck(key);
      setSelKey(key);
    } else if (e.shiftKey && lastClickRef.current) {
      const order = visible.map((v) => v.key);
      const a = order.indexOf(lastClickRef.current);
      const b = order.indexOf(key);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setMultiMode(true);
        setSelKeys(order.slice(lo, hi + 1));
      }
      setSelKey(key);
    } else {
      clearSelection();
      lastClickRef.current = key;
      setSelKey(key);
    }
    setPdf(null);
  };
  /** Double-click on a list row = open its stored PDF straight in the reader
   *  (Zotero's row interaction; same reader the DetailPane attachment rows
   *  open). Items without a stored PDF just stay selected. */
  const openItemPdf = (i: LibItem) => {
    const a = i.attachments.find((x) => x.contentType === "application/pdf" && x.relPath);
    if (!a?.relPath) return;
    clearSelection();
    lastClickRef.current = i.key;
    setSelKey(i.key);
    setPdf({ key: a.key, relPath: a.relPath, name: a.title });
  };
  const allVisibleSelected = visible.length > 0 && visible.every((v) => selKeys.includes(v.key));
  const toggleSelectAll = () => {
    if (allVisibleSelected) clearSelection();
    else {
      setMultiMode(true);
      setSelKeys(visible.map((v) => v.key));
    }
  };
  /** Bulk action: move the checked papers to the trash (recoverable). */
  const bulkTrash = async () => {
    const keys = [...selKeys];
    setBusy(true);
    try {
      for (const k of keys) await setTrashed(k, true);
      await reload();
      clearSelection();
      setPdf(null);
      say(t("Moved {n} paper(s) to the trash.").replace("{n}", String(keys.length)));
    } catch (e) {
      say(String(e));
    }
    setBusy(false);
  };

  // ── Bibliography export (APA 6th / GB/T 7714) ─────────────────────────────
  // From the bulk bar it takes the checked papers; from the overflow menu the
  // whole visible list. Copy goes to the clipboard; save via native Save As.
  const citationStyleLabel = (style: CitationStyle) =>
    style === "apa" ? "APA 6th" : "GB/T 7714";
  const exportCitations = async (
    targets: LibItem[],
    style: CitationStyle,
    mode: "copy" | "file",
  ) => {
    if (targets.length === 0) return;
    const text = formatBibliography(targets, style).join("\n");
    try {
      if (mode === "copy") {
        await navigator.clipboard.writeText(text);
        say(
          t("Copied {n} reference(s) ({style}).")
            .replace("{n}", String(targets.length))
            .replace("{style}", citationStyleLabel(style)),
        );
      } else {
        const res = await saveTextFile(
          style === "apa" ? "references-apa.txt" : "references-gbt7714.txt",
          text,
        );
        if (res.kind === "saved") {
          say(
            t("Saved {n} reference(s) to {path}.")
              .replace("{n}", String(targets.length))
              .replace("{path}", res.path),
          );
        }
      }
    } catch (e) {
      say(String(e));
    }
  };

  // Whole-library clear. Two levels, both confirmed: move every paper to the
  // trash (recoverable), or — from the trash view — empty it for good.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const [clearConfirm, setClearConfirm] = useState<null | "trash-all" | "empty-trash">(null);
  useEffect(() => {
    if (!overflowOpen) return;
    const close = (e: MouseEvent) => {
      if (!overflowRef.current?.contains(e.target as Node)) setOverflowOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [overflowOpen]);
  const clearAllToTrash = async () => {
    const live = items.filter((i) => !i.trashed);
    setBusy(true);
    try {
      for (const i of live) await setTrashed(i.key, true);
      await reload();
      clearSelection();
      setPdf(null);
      say(t("Moved {n} paper(s) to the trash.").replace("{n}", String(live.length)));
    } catch (e) {
      say(String(e));
    }
    setBusy(false);
  };
  const emptyTrash = async () => {
    const trashed = items.filter((i) => i.trashed);
    setBusy(true);
    try {
      for (const i of trashed) await deleteItem(i.key);
      await reload();
      clearSelection();
      say(t("Permanently deleted {n} paper(s).").replace("{n}", String(trashed.length)));
    } catch (e) {
      say(String(e));
    }
    setBusy(false);
  };

  const doAddFiles = async () => {
    const paths = await pickPdfs();
    if (paths.length === 0) return;
    setBusy(true);
    try {
      const res = await addFiles(paths);
      await reload();
      if (res.added.length > 0) setSelKey(res.added[0].key);
      const parts = [];
      if (res.added.length) parts.push(t("Added {n} item(s).").replace("{n}", String(res.added.length)));
      parts.push(...res.errors);
      if (parts.length) say(parts.join(" "));
    } catch (e) {
      say(String(e));
    }
    setBusy(false);
  };

  // Batch "Generate wiki" for the checked papers or the whole library: the
  // batch runs papers one by one in a single fresh session, so confirm the
  // model-quota cost before firing. Papers already in the wiki are split out
  // and skipped — re-ingesting them needs an explicit override.
  const [genConfirm, setGenConfirm] = useState<{
    /** Eligible keys NOT yet in the wiki. */
    fresh: string[];
    /** Eligible keys already in the wiki (skipped by default). */
    ingested: string[];
  } | null>(null);
  const requestGenerate = (targets: LibItem[]) => {
    const eligible = targets.filter(
      (i) =>
        !i.trashed &&
        i.attachments.some((a) => a.contentType === "application/pdf" && a.relPath),
    );
    if (eligible.length === 0) {
      say(t("None of these items has a stored PDF."));
      return;
    }
    setGenConfirm({
      fresh: eligible.filter((i) => !ingestedKeys.has(i.key)).map((i) => i.key),
      ingested: eligible.filter((i) => ingestedKeys.has(i.key)).map((i) => i.key),
    });
  };
  const runGenerate = async (keys: string[]) => {
    setGenConfirm(null);
    setBusy(true);
    try {
      const out = await stageAndGenerate(keys, t, () => {
        if (onOpenChat) onOpenChat();
        else navigate("/live");
      });
      onGenerateStarted?.();
      if (out.skipped.length > 0) {
        say(t("Skipped (no PDF): {list}").replace("{list}", out.skipped.join("; ")));
      }
    } catch (e) {
      say(String(e));
    }
    void refreshIngested();
    setBusy(false);
  };

  const doImportZotero = async () => {
    setBusy(true);
    try {
      const res = await importZotero();
      await reload();
      say(
        t("Imported {a} from Zotero, {b} already present.")
          .replace("{a}", String(res.imported))
          .replace("{b}", String(res.skipped)),
      );
    } catch (e) {
      say(String(e));
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> {t("Loading…")}
      </div>
    );
  }

  if (!lib) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted">
        {t("The library is available in the desktop app.")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {genConfirm &&
        (genConfirm.fresh.length > 0 ? (
          <ConfirmDialog
            title={t("Generate wiki")}
            body={
              t(
                "Ingest {n} paper(s) into this project's wiki, one at a time? This is a longer run and uses more model quota.",
              ).replace("{n}", String(genConfirm.fresh.length)) +
              (genConfirm.ingested.length > 0
                ? " " +
                  t("{m} paper(s) are already in the wiki and will be skipped.").replace(
                    "{m}",
                    String(genConfirm.ingested.length),
                  )
                : "")
            }
            confirmLabel={t("Generate wiki")}
            onConfirm={() => void runGenerate(genConfirm.fresh)}
            onCancel={() => setGenConfirm(null)}
          />
        ) : (
          /* Everything selected is already in the wiki — re-ingesting is an
             explicit override, never the silent default. */
          <ConfirmDialog
            title={t("Generate wiki")}
            body={t(
              "All {n} selected paper(s) are already in the wiki. Re-ingest them anyway?",
            ).replace("{n}", String(genConfirm.ingested.length))}
            confirmLabel={t("Re-ingest anyway")}
            onConfirm={() => void runGenerate(genConfirm.ingested)}
            onCancel={() => setGenConfirm(null)}
          />
        ))}
      {clearConfirm === "trash-all" && (
        <ConfirmDialog
          title={t("Clear all papers")}
          body={t(
            "Move all {n} paper(s) to the trash? They stay recoverable in the trash until you empty it.",
          ).replace("{n}", String(items.filter((i) => !i.trashed).length))}
          confirmLabel={t("Move to trash")}
          onConfirm={() => {
            setClearConfirm(null);
            void clearAllToTrash();
          }}
          onCancel={() => setClearConfirm(null)}
        />
      )}
      {clearConfirm === "empty-trash" && (
        <ConfirmDialog
          title={t("Empty trash (permanent)")}
          body={t(
            "Permanently delete all {n} paper(s) in the trash, including their stored files? This cannot be undone.",
          ).replace("{n}", String(items.filter((i) => i.trashed).length))}
          confirmLabel={t("Delete permanently")}
          onConfirm={() => {
            setClearConfirm(null);
            void emptyTrash();
          }}
          onCancel={() => setClearConfirm(null)}
        />
      )}

      {/* Item table */}
      <div ref={setTableEl} className="flex min-w-[200px] flex-1 flex-col border-r border-border">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <AddMenu
            busy={busy}
            canImportZotero={canImportZotero}
            onAddFiles={doAddFiles}
            onAddDoi={async (doi) => {
              setBusy(true);
              try {
                const item = await addDoi(doi);
                await reload();
                setSelKey(item.key);
              } catch (e) {
                say(String(e));
              }
              setBusy(false);
            }}
            onImportZotero={doImportZotero}
            onSearchOpenAlex={() =>
              void startLiteratureSearch(t, () => {
                if (onOpenChat) onOpenChat();
                else navigate("/live");
              })
            }
          />
          {scope.kind !== "trash" && (
            <button
              disabled={busy}
              onClick={() => requestGenerate(items.filter((i) => !i.trashed))}
              title={t("Generate wiki for every paper in the library")}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-input border border-border bg-surface-2 px-2 py-1 text-[14px] text-text hover:bg-surface disabled:opacity-50"
            >
              <Network size={13} /> {t("Generate wiki")}
            </button>
          )}
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search title, author, tag, DOI")}
              className="w-full rounded-input border border-border bg-surface-2 py-1 pl-7 pr-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent/50"
            />
          </div>
          <button
            className="shrink-0 text-muted hover:text-text"
            aria-label={t("Refresh library")}
            title={t("Refresh library")}
            onClick={() => void reload()}
          >
            <ARefresh size={14} />
          </button>
          <div ref={overflowRef} className="relative shrink-0">
            <button
              className="text-muted hover:text-text"
              aria-label={t("More actions")}
              title={t("More actions")}
              onClick={() => setOverflowOpen((o) => !o)}
            >
              <MoreHorizontal size={16} />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-card border border-border bg-surface p-1 shadow-pop">
                <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
                  {t("Export citations")}
                </div>
                <ExportCitationRows
                  disabled={busy || visible.length === 0}
                  onPick={(style, mode) => {
                    setOverflowOpen(false);
                    void exportCitations(visible, style, mode);
                  }}
                />
                <div className="my-1 border-t border-border" />
                {scope.kind === "trash" ? (
                  <button
                    disabled={busy || items.every((i) => !i.trashed)}
                    onClick={() => {
                      setOverflowOpen(false);
                      setClearConfirm("empty-trash");
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-error hover:bg-surface-2 disabled:opacity-40"
                  >
                    <Trash2 size={13} className="shrink-0" />
                    {t("Empty trash (permanent)")}
                  </button>
                ) : (
                  <button
                    disabled={busy || items.every((i) => i.trashed)}
                    onClick={() => {
                      setOverflowOpen(false);
                      setClearConfirm("trash-all");
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-error hover:bg-surface-2 disabled:opacity-40"
                  >
                    <Trash2 size={13} className="shrink-0" />
                    {t("Clear all papers")}
                  </button>
                )}
              </div>
            )}
          </div>
          {switching && (
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-muted">
              <Loader2 size={13} className="animate-spin" /> {t("Entering project…")}
            </span>
          )}
          {busy && !switching && <Loader2 size={14} className="shrink-0 animate-spin text-muted" />}
        </div>
        {notice && (
          <div className="border-b border-border bg-surface-2 px-3 py-1.5 text-[12px] text-text">
            {notice}
          </div>
        )}
        {/* Bulk-selection bar: act on the checked papers (generate wiki,
            export citations, trash). Always mounted; slides open via grid-rows
            so the table below moves smoothly instead of jumping
            (motion-reduce: no animation). */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            multiMode && selKeys.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-[13px] text-text">
              <span className="shrink-0">
                {t("{n} selected").replace("{n}", String(selKeys.length))}
              </span>
              {scope.kind !== "trash" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    requestGenerate(visible.filter((i) => selKeys.includes(i.key)))
                  }
                  className="flex shrink-0 items-center gap-1 rounded-input border border-border bg-surface px-2 py-0.5 hover:bg-surface-2 disabled:opacity-50"
                >
                  <Network size={13} /> {t("Generate wiki")}
                </button>
              )}
              <ExportCitationsMenu
                busy={busy}
                onPick={(style, mode) =>
                  void exportCitations(
                    visible.filter((i) => selKeys.includes(i.key)),
                    style,
                    mode,
                  )
                }
              />
              {scope.kind !== "trash" && (
                <button
                  disabled={busy}
                  onClick={() => void bulkTrash()}
                  className="flex shrink-0 items-center gap-1 rounded-input border border-border bg-surface px-2 py-0.5 hover:bg-surface-2 disabled:opacity-50"
                >
                  <Trash2 size={13} /> {t("Move to trash")}
                </button>
              )}
              <button onClick={clearSelection} className="shrink-0 text-muted hover:text-text">
                {t("Clear")}
              </button>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "grid gap-2 border-b border-border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted",
            gridCols,
          )}
        >
          <input
            type="checkbox"
            aria-label={t("Select all")}
            title={t("Select all")}
            className="h-3.5 w-3.5 accent-accent"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
          />
          <HeaderCell label={t("Title")} on={() => clickSort("title")} active={sort.col === "title"} asc={sort.asc} />
          {!compact && (
            <HeaderCell label={t("Creator")} on={() => clickSort("creators")} active={sort.col === "creators"} asc={sort.asc} />
          )}
          {!compact && (
            <HeaderCell label={t("Year")} on={() => clickSort("year")} active={sort.col === "year"} asc={sort.asc} />
          )}
          <span />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 && (
            <div className="px-4 py-8 text-center text-[14px] text-muted">
              {items.length === 0
                ? t("The library is empty. Add a PDF or import your Zotero library to get started.")
                : t("Nothing matches.")}
            </div>
          )}
          {visible.map((i) => (
            <div
              key={i.key}
              onClick={(e) => rowClick(e, i.key)}
              onDoubleClick={(e) => {
                // Modified clicks are multi-select gestures, never "open".
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey) openItemPdf(i);
              }}
              className={cn(
                "group grid cursor-default items-center gap-2 px-3 py-1.5 text-[14px]",
                gridCols,
                selKeys.includes(i.key) || selKey === i.key
                  ? "bg-surface-2 text-text"
                  : "text-text hover:bg-surface-2/60",
              )}
            >
              <input
                type="checkbox"
                aria-label={t("Select")}
                className={cn(
                  "h-3.5 w-3.5 accent-accent",
                  multiMode || selKeys.includes(i.key)
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                )}
                checked={selKeys.includes(i.key)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleCheck(i.key)}
              />
              <span className="flex min-w-0 items-center gap-2">
                <ABook size={13} className="shrink-0 text-muted" />
                <span className="truncate">{i.title}</span>
                {ingestedKeys.has(i.key) && (
                  <span
                    title={t("Already in the wiki")}
                    className="shrink-0 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-1.5 text-[10px] leading-4 text-emerald-700 dark:text-emerald-400"
                  >
                    {t("In wiki")}
                  </span>
                )}
              </span>
              {!compact && <span className="truncate text-muted">{creatorsLabel(i)}</span>}
              {!compact && <span className="text-muted">{i.year ?? ""}</span>}
              {i.attachments.some((a) => a.relPath) ? (
                <Paperclip size={12} className="text-muted" />
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        {/* Footer doubles as the scope switch — the trash lived in the removed
            collections column, so its entry moved here. */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1 text-[11px] text-muted">
          <span className="min-w-0 flex-1 truncate">
            {scope.kind === "trash"
              ? t("Trash") + " · " + t("{n} item(s)").replace("{n}", String(visible.length))
              : t("{n} item(s)").replace("{n}", String(visible.length))}
          </span>
          {scope.kind === "trash" ? (
            <button
              className="shrink-0 hover:text-text"
              onClick={() => {
                setScope({ kind: "all" });
                setPdf(null);
                clearSelection();
              }}
            >
              {t("All items")}
            </button>
          ) : (
            <button
              className="flex shrink-0 items-center gap-1 hover:text-text"
              title={t("Trash")}
              onClick={() => {
                setScope({ kind: "trash" });
                setPdf(null);
                clearSelection();
              }}
            >
              <Trash2 size={11} />
              {t("Trash")}
              {items.some((i) => i.trashed) && (
                <span>{items.filter((i) => i.trashed).length}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Right: metadata editor or the opened PDF (with annotations) */}
      {pdf && selected ? (
        <PdfReader
          key={pdf.key}
          attachmentKey={pdf.key}
          relPath={pdf.relPath}
          name={pdf.name}
          onClose={() => setPdf(null)}
        />
      ) : selected ? (
        <DetailPane
          key={selected.key}
          item={selected}
          ingested={ingestedKeys.has(selected.key)}
          inTrash={scope.kind === "trash"}
          onChanged={patchItem}
          onReload={reload}
          onDeselect={() => setSelKey(null)}
          onOpenPdf={(key, relPath, name) => setPdf({ key, relPath, name })}
          onOpenChat={onOpenChat}
          onGenerateStarted={onGenerateStarted}
        />
      ) : null}
    </div>
  );
}

function HeaderCell({
  label,
  on,
  active,
  asc,
}: {
  label: string;
  on: () => void;
  active: boolean;
  asc: boolean;
}) {
  return (
    <button onClick={on} className="flex items-center gap-1 whitespace-nowrap text-left hover:text-text">
      {label}
      {active && <span className="text-[9px]">{asc ? "▲" : "▼"}</span>}
    </button>
  );
}

/** The four export actions (copy / save × APA / GB/T), shared between the
 *  bulk-bar dropdown and the "…" overflow menu. */
function ExportCitationRows({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (style: CitationStyle, mode: "copy" | "file") => void;
}) {
  const t = useT();
  const rows: { label: string; style: CitationStyle; mode: "copy" | "file"; icon: React.ReactNode }[] = [
    { label: t("Copy as APA 6th"), style: "apa", mode: "copy", icon: <Copy size={13} className="shrink-0" /> },
    { label: t("Copy as GB/T 7714"), style: "gbt7714", mode: "copy", icon: <Copy size={13} className="shrink-0" /> },
    { label: t("Save as file (APA 6th)…"), style: "apa", mode: "file", icon: <FileDown size={13} className="shrink-0" /> },
    { label: t("Save as file (GB/T 7714)…"), style: "gbt7714", mode: "file", icon: <FileDown size={13} className="shrink-0" /> },
  ];
  return (
    <>
      {rows.map((r) => (
        <button
          key={`${r.style}-${r.mode}`}
          disabled={disabled}
          onClick={() => onPick(r.style, r.mode)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-text hover:bg-surface-2 disabled:opacity-40"
        >
          {r.icon}
          {r.label}
        </button>
      ))}
    </>
  );
}

/** Bulk-bar dropdown: export the checked papers as a formatted bibliography.
 *  Fixed-position portal to <body> — the bulk bar's overflow-hidden wrapper
 *  (for the grid-rows slide) would clip a normally-positioned menu. */
function ExportCitationsMenu({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (style: CitationStyle, mode: "copy" | "file") => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (!btnRef.current?.contains(tgt) && !menuRef.current?.contains(tgt)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        disabled={busy}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex items-center gap-1 rounded-input border border-border bg-surface px-2 py-0.5 hover:bg-surface-2 disabled:opacity-50"
      >
        <Quote size={13} /> {t("Export citations")} <ChevronDown size={12} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", left: pos.left, top: pos.top }}
            className="z-50 w-60 rounded-card border border-border bg-surface p-1 shadow-pop"
          >
            <ExportCitationRows
              onPick={(style, mode) => {
                setOpen(false);
                onPick(style, mode);
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function AddMenu({
  busy,
  canImportZotero,
  onAddFiles,
  onAddDoi,
  onImportZotero,
  onSearchOpenAlex,
}: {
  busy: boolean;
  canImportZotero: boolean;
  onAddFiles: () => void;
  onAddDoi: (doi: string) => void;
  onImportZotero: () => void;
  onSearchOpenAlex: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [doiOpen, setDoiOpen] = useState(false);
  const [doi, setDoi] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-input border border-border bg-surface-2 px-2 py-1 text-[14px] text-text hover:bg-surface disabled:opacity-50"
      >
        <Plus size={13} /> {t("Add")}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-card border border-border bg-surface p-1 shadow-pop">
          <MenuRow
            onClick={() => {
              setOpen(false);
              onAddFiles();
            }}
          >
            <FileText size={13} /> {t("Add files (PDF)…")}
          </MenuRow>
          <MenuRow
            onClick={() => {
              setOpen(false);
              setDoiOpen(true);
            }}
          >
            <Search size={13} /> {t("Add by DOI…")}
          </MenuRow>
          <MenuRow
            onClick={() => {
              setOpen(false);
              onSearchOpenAlex();
            }}
          >
            <Search size={13} /> {t("Search English literature (OpenAlex)…")}
          </MenuRow>
          {canImportZotero && (
            <MenuRow
              onClick={() => {
                setOpen(false);
                onImportZotero();
              }}
            >
              <ABook size={13} /> {t("Import local Zotero library")}
            </MenuRow>
          )}
        </div>
      )}
      {doiOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-72 items-center gap-1 rounded-card border border-border bg-surface p-2 shadow-pop">
          <input
            autoFocus
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && doi.trim()) {
                setDoiOpen(false);
                onAddDoi(doi.trim());
                setDoi("");
              } else if (e.key === "Escape") {
                setDoiOpen(false);
              }
            }}
            placeholder="10.1234/example"
            className="min-w-0 flex-1 rounded-input border border-border bg-surface-2 px-2 py-1 text-[14px] text-text outline-none placeholder:text-muted"
          />
          <button
            className="text-muted hover:text-text"
            aria-label={t("Close")}
            onClick={() => setDoiOpen(false)}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function MenuRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[14px] text-text hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

