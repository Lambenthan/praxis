import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ABook, ARefresh } from "@/components/icons/anthropic";
import { listDir, readArtifact } from "@/lib/artifactFile";
import {
  buildWikilinkResolver,
  computeWikiNeighbors,
  deriveEdgesFromCards,
  mergeWikiEdges,
  parseWikiEdges,
  wikiTypeColor,
  type WikiCardSource,
  type WikiNode,
} from "@/lib/wikiGraph";
import { WikiCardPanel } from "@/components/wiki-graph/WikiCardPanel";
import { LightragGraphPanel } from "@/components/wiki-graph/LightragGraphPanel";
import { useRuntimeStore } from "@/lib/runtime";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { ResizeEdge, useStoredWidth } from "./ResizeEdge";

/** Entity dirs in reading order — papers first, then the empirical chain the
 *  ingest skill writes; anything else the wiki contains is appended after. */
const DIR_ORDER = [
  "papers",
  "topics",
  "concepts",
  "variables",
  "datasets",
  "models",
  "hypotheses",
  "mechanisms",
  "identification",
  "robustness",
  "heterogeneity",
  "assumptions",
  "propositions",
  "claims",
  "experiments",
  "foundations",
  "outputs",
  "tables",
  "people",
  "ideas",
  "Summary",
];

interface TreeSection {
  dir: string;
  files: string[];
}

/** The graph pane's data, with every failure mode named — the pane must never
 *  be silently blank (docs/DESIGN_GUIDELINES.md: failures visible in place). */
type GraphState =
  | { kind: "loading" }
  | { kind: "ready"; text: string; derived: boolean }
  | { kind: "none"; reason: "no-cards" | "no-links" }
  | { kind: "error"; message: string };

/**
 * The Wiki surface: the open project's ONE wiki (<workspace>/wiki), browsed
 * Obsidian-style — the entity tree on the left, the opened card as a reading
 * page in the middle, the connection graph beside it. The page-level
 * conversation drawer sits next to all of it.
 */
export function WikiView() {
  const t = useT();
  /** null = still checking; the wiki exists once generation wrote wiki/index.md. */
  const [wikiExists, setWikiExists] = useState<boolean | null>(null);
  const [tree, setTree] = useState<TreeSection[]>([]);
  const [graph, setGraph] = useState<GraphState>({ kind: "loading" });
  /** Every card's text — read on load so the reading pane can resolve
   *  [[wikilinks]] and list a card's neighbors even when edges.jsonl exists
   *  (concept cards often connect only through body links). */
  const [cards, setCards] = useState<WikiCardSource[]>([]);
  const [sel, setSel] = useState<WikiNode | null>(null);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  /** Show one section (entity type) only; "" = all. Local to the view. */
  const [sectionFilter, setSectionFilter] = useState("");
  /** Project-centric: the wiki belongs to the OPEN project — it lives at
   *  <workspace>/wiki, read through the "workspace" root. One wiki per project. */
  const workspace = useRuntimeStore((s) => s.workspace);
  const discover = useCallback(async () => {
    try {
      setWikiExists(!!(await readArtifact("wiki/index.md", "workspace")));
    } catch {
      setWikiExists(false); // not generated yet
    }
  }, []);

  /** Load the open project's wiki tree + graph edges (from <workspace>/wiki). */
  const loadWiki = useCallback(async () => {
    let sections: TreeSection[] = [];
    try {
      const top = await listDir("wiki", "workspace");
      const dirs = top.filter((e) => e.isDir && e.name !== "graph").map((e) => e.name);
      for (const dir of dirs) {
        try {
          const files = (await listDir(`wiki/${dir}`, "workspace"))
            .filter((e) => !e.isDir && e.name.endsWith(".md"))
            .map((e) => e.name.replace(/\.md$/, ""));
          if (files.length > 0) sections.push({ dir, files: files.sort((a, b) => a.localeCompare(b)) });
        } catch {
          /* skip unreadable dirs */
        }
      }
      sections.sort((a, b) => {
        const ia = DIR_ORDER.indexOf(a.dir);
        const ib = DIR_ORDER.indexOf(b.dir);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.dir.localeCompare(b.dir);
      });
      setTree(sections);
    } catch {
      sections = [];
      setTree([]);
    }
    // The graph: prefer the generated graph/edges.jsonl; when it is absent or
    // empty (e.g. an interrupted ingest run), derive edges from the cards'
    // [[wikilinks]] so a complete wiki always draws. Every failure mode gets a
    // visible state — never a silently blank pane.
    try {
      let fileText = "";
      try {
        const f = await readArtifact("wiki/graph/edges.jsonl", "workspace");
        fileText = f && f.encoding === "utf8" ? f.data : "";
      } catch {
        /* no generated graph file — fall through to deriving */
      }
      // Cards are read regardless of the edges file: the reading pane needs
      // them to resolve [[wikilinks]] and compute a card's Related section.
      const paths = sections.flatMap((s) => s.files.map((slug) => ({ dir: s.dir, slug })));
      const loaded = (
        await Promise.all(
          paths.map(async ({ dir, slug }): Promise<WikiCardSource | null> => {
            try {
              const f = await readArtifact(`wiki/${dir}/${slug}.md`, "workspace");
              return f && f.encoding === "utf8" ? { id: `${dir}/${slug}`, text: f.data } : null;
            } catch {
              return null; // skip unreadable card
            }
          }),
        )
      ).filter((c): c is WikiCardSource => c !== null);
      setCards(loaded);
      if (parseWikiEdges(fileText).length > 0) {
        setGraph({ kind: "ready", text: fileText, derived: false });
        return;
      }
      if (paths.length === 0) {
        setGraph({ kind: "none", reason: "no-cards" });
        return;
      }
      const derived = deriveEdgesFromCards(loaded);
      if (derived.length === 0) {
        setGraph({ kind: "none", reason: "no-links" });
        return;
      }
      setGraph({
        kind: "ready",
        text: derived.map((e) => JSON.stringify(e)).join("\n"),
        derived: true,
      });
    } catch (err) {
      setGraph({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    setSel(null);
    setSectionFilter("");
    setGraph({ kind: "loading" });
    setCards([]);
    void discover();
    void loadWiki();
  }, [workspace, discover, loadWiki]);

  /** [[wikilink]] target → card id, shared with the graph's edge derivation. */
  const resolveLink = useMemo(() => buildWikilinkResolver(cards.map((c) => c.id)), [cards]);
  /** The full relation set for the Related section: the generated graph's
   *  typed edges plus the cards' [[wikilink]] edges (deduped). edges.jsonl
   *  alone misses link-only cards — e.g. concepts in a generated wiki. */
  const allEdges = useMemo(
    () =>
      mergeWikiEdges(
        graph.kind === "ready" ? parseWikiEdges(graph.text) : [],
        deriveEdgesFromCards(cards),
      ),
    [graph, cards],
  );
  const related = useMemo(
    () => (sel ? computeWikiNeighbors(allEdges, sel.id) : null),
    [sel, allEdges],
  );

  // A stale filter (section vanished after a reload) falls back to all types.
  const shownTree = useMemo(() => {
    if (sectionFilter && tree.some((s) => s.dir === sectionFilter))
      return tree.filter((s) => s.dir === sectionFilter);
    return tree;
  }, [tree, sectionFilter]);
  const cardCount = useMemo(() => shownTree.reduce((n, s) => n + s.files.length, 0), [shownTree]);
  const [treeW, setTreeW] = useStoredWidth("fishes.wiki.tree.w", 230, 150, 380);
  const [graphW, setGraphW] = useStoredWidth("fishes.wiki.graph.w", 420, 260, 900);
  const [graphOpen, setGraphOpen] = useState(
    () => localStorage.getItem("fishes.wiki.graph.open") !== "0",
  );
  const toggleGraph = () => {
    setGraphOpen((open) => {
      localStorage.setItem("fishes.wiki.graph.open", open ? "0" : "1");
      return !open;
    });
  };

  if (wikiExists === null) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> {t("Loading…")}
      </div>
    );
  }

  if (!wikiExists) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <ABook size={28} className="mx-auto text-muted" />
            <h1 className="mt-4 font-serif text-[20px] text-text">{t("No wiki yet")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {t(
                "Generate one from the Library tab: pick a paper or the whole library and press “Generate wiki”. Every ingested paper lands in this project's wiki.",
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Entity tree */}
      {/* Stored pane widths are ABSOLUTE, so in a narrow window tree+graph
          could exceed the container — the reader collapsed to zero and the
          graph pane painted on top of it (user-reported). Percentage caps
          bound both sides so the reading pane always keeps real width. */}
      <aside
        className="relative flex max-w-[30%] shrink-0 flex-col overflow-y-auto border-r border-border"
        style={{ width: treeW }}
      >
        <ResizeEdge edge="right" width={treeW} onResize={setTreeW} />
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
          {/* One wiki per project — the old wiki picker is gone; this filters
              the tree to one entity type instead. */}
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            title={t("Show one card type only")}
            className="min-w-0 flex-1 rounded-input border border-border bg-surface px-1.5 py-1 text-[13px] text-text outline-none"
          >
            <option value="">{t("All types")}</option>
            {tree.map((s) => (
              <option key={s.dir} value={s.dir}>
                {s.dir}
              </option>
            ))}
          </select>
          <button
            className="shrink-0 text-muted hover:text-text"
            aria-label={t("Reload")}
            onClick={() => {
              void discover();
              void loadWiki();
            }}
          >
            <ARefresh size={14} />
          </button>
        </div>
        {tree.length === 0 && (
          <div className="px-3 py-2 text-[13px] text-muted">{t("This wiki has no cards yet.")}</div>
        )}
        {shownTree.map((s) => {
          const closed = collapsedDirs.has(s.dir);
          return (
            <div key={s.dir}>
              <button
                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[12px] font-semibold text-text-000 hover:bg-surface-2/60"
                onClick={() =>
                  setCollapsedDirs((c) => {
                    const n = new Set(c);
                    if (n.has(s.dir)) n.delete(s.dir);
                    else n.add(s.dir);
                    return n;
                  })
                }
              >
                {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                {/* Same type→color mapping as the graph nodes (wikiTypeColor),
                    so the tree and the graph legend read as one system. */}
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: wikiTypeColor(s.dir) }}
                />
                {s.dir}
                <span className="ml-auto font-normal text-muted">{s.files.length}</span>
              </button>
              {!closed &&
                s.files.map((slug) => {
                  const id = `${s.dir}/${slug}`;
                  const active = sel?.id === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setSel({ id, type: s.dir, label: slug, degree: 0 })}
                      className={cn(
                        "block w-full truncate px-4 py-1 text-left text-[14px]",
                        active ? "bg-surface-2 text-text" : "text-text hover:bg-surface-2/60",
                      )}
                    >
                      {slug}
                    </button>
                  );
                })}
            </div>
          );
        })}
        <div className="mt-auto border-t border-border px-3 py-1 text-[11px] text-muted">
          {t("{n} card(s)").replace("{n}", String(cardCount))}
        </div>
      </aside>

      {/* Reading page (Obsidian-like). With nothing selected it collapses
          entirely and the graph takes the width — unless the graph is hidden
          too, in which case the hint must stay (never a tree beside a void). */}
      {(sel !== null || !graphOpen) && (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {sel ? (
            <WikiCardPanel
              key={sel.id}
              node={sel}
              wikiRoot="wiki"
              root="workspace"
              onClose={() => setSel(null)}
              // Sit on the page background like the tree — a stark white pane beside
            // the warm panes read as a seam (user-reported).
            className="min-h-0 w-auto min-w-0 max-w-none flex-1 border-l-0 bg-bg-100"
              related={related}
              onOpen={(card) => setSel({ ...card, degree: 0 })}
              resolveLink={resolveLink}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-[14px] leading-relaxed text-muted">
              {t("Pick a card from the tree or the graph to read it here.")}
            </div>
          )}
        </div>
      )}

      {/* Knowledge graph — collapsible: some reading sessions don't want it.
          With no card open it is the main surface (flex-1); with a card open
          it returns to its stored, resizable width. */}
      {graphOpen ? (
        <div
          className={cn(
            "relative flex flex-col overflow-hidden border-l border-border",
            sel ? "max-w-[45%] shrink-0" : "min-w-0 flex-1",
          )}
          style={sel ? { width: graphW } : undefined}
        >
          {sel && <ResizeEdge edge="left" width={graphW} onResize={setGraphW} />}
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
            <span className="text-[13px] font-medium text-text">{t("Graph")}</span>
            <div className="flex-1" />
            <button
              className="text-muted hover:text-text"
              aria-label={t("Hide graph")}
              title={t("Hide graph")}
              onClick={toggleGraph}
            >
              <PanelRightClose size={15} />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {graph.kind === "loading" ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
                <Loader2 size={14} className="animate-spin" /> {t("Loading…")}
              </div>
            ) : graph.kind === "error" ? (
              <div className="p-4 text-[13px] leading-relaxed text-red-600">
                {t("The graph could not be loaded.")} {graph.message}
              </div>
            ) : graph.kind === "none" ? (
              <div className="p-4 text-[13px] leading-relaxed text-muted">
                {graph.reason === "no-cards"
                  ? t("No graph yet for this wiki.")
                  : t(
                      "No graph file (graph/edges.jsonl) and no [[links]] between cards were found, so there is nothing to draw yet.",
                    )}
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                {graph.derived && (
                  <div className="shrink-0 border-b border-border px-3 py-1 text-[11px] leading-relaxed text-muted">
                    {t("Derived from card links — this wiki has no graph/edges.jsonl file.")}
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <LightragGraphPanel text={graph.text} onSelect={(node) => setSel(node)} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Collapsed: no column at all — just a floating reopen button, so the
           reading page and the conversation drawer sit flush. */
        <button
          className="absolute right-2 top-12 z-10 rounded-input border border-border bg-surface p-1.5 text-muted shadow-card hover:bg-surface-2 hover:text-text"
          aria-label={t("Show graph")}
          title={t("Show graph")}
          onClick={toggleGraph}
        >
          <PanelRightOpen size={15} />
        </button>
      )}
    </div>
  );
}

