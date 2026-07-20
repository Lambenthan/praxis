import { useEffect, useMemo, useRef, useState } from "react";
import {
  Expand,
  GripVertical,
  Maximize,
  Minus,
  Pause,
  Play,
  Plus,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import {
  buildNodes,
  parseWikiEdges,
  wikiTypeColor,
  type WikiEdge,
  type WikiNode,
} from "@/lib/wikiGraph";
// Type-only: sigma touches WebGL2 at module load, so the renderer itself is
// imported dynamically inside the mount effect (jsdom tests + bundle size).
import type { WikiGraphHandle } from "./renderWikiGraphSigma";

/**
 * LightRAG WebUI's knowledge-graph panel, ported (MIT — HKUDS/LightRAG
 * lightrag_webui): the sigma canvas plus its chrome — layout switcher
 * (Circular / Circlepack / Random / Noverlaps / Force Directed / Force Atlas,
 * the last three as worker layouts with play/pause), zoom in/out/fit,
 * fullscreen, node search with camera focus, the node Properties card with
 * clickable Relations, a type legend, and the counts footer. Fishes skin,
 * LightRAG anatomy.
 */

const SYNC_LAYOUTS = ["Circular", "Circlepack", "Random"] as const;
const WORKER_LAYOUTS = ["Noverlaps", "Force Directed", "Force Atlas"] as const;
type LayoutName = (typeof SYNC_LAYOUTS)[number] | (typeof WORKER_LAYOUTS)[number];
const ALL_LAYOUTS: LayoutName[] = [...SYNC_LAYOUTS, ...WORKER_LAYOUTS];

const ANIMATE_NODE_LIMIT = 500;
const workerBudgetMs = (order: number): number => Math.min(1500 + order / 10, 10000);

interface Supervisor {
  start: () => void;
  stop: () => void;
  kill: () => void;
  isRunning: () => boolean;
}

export function LightragGraphPanel({
  text,
  onSelect,
}: {
  /** The wiki's edges.jsonl content. */
  text: string;
  onSelect?: (node: WikiNode) => void;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WikiGraphHandle | null>(null);
  const supervisorRef = useRef<Supervisor | null>(null);
  const budgetTimerRef = useRef<number | null>(null);
  const [selected, setSelected] = useState<WikiNode | null>(null);
  const [layout, setLayout] = useState<LayoutName>("Force Atlas");
  const [layoutMenu, setLayoutMenu] = useState(false);
  const [workerRunning, setWorkerRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const { nodes, edges } = useMemo(() => {
    const parsed: WikiEdge[] = parseWikiEdges(text);
    return { nodes: buildNodes(parsed), edges: parsed };
  }, [text]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Mount the sigma instance (the LightRAG-derived renderer).
  useEffect(() => {
    const host = hostRef.current;
    if (!host || nodes.length === 0) return;
    let disposed = false;
    let h: WikiGraphHandle | null = null;
    (async () => {
      const { mountWikiGraph } = await import("./renderWikiGraphSigma");
      if (disposed) return;
      h = mountWikiGraph(host, nodes, edges, (n) => {
        setSelected(n);
        if (n) onSelect?.(n);
      });
      if (disposed) {
        h.dispose();
        return;
      }
      handleRef.current = h;
    })();
    return () => {
      disposed = true;
      stopWorker();
      handleRef.current = null;
      h?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount only on data change
  }, [nodes, edges]);

  const stopWorker = () => {
    if (budgetTimerRef.current !== null) {
      window.clearTimeout(budgetTimerRef.current);
      budgetTimerRef.current = null;
    }
    try {
      supervisorRef.current?.kill();
    } catch {
      /* already dead */
    }
    supervisorRef.current = null;
    setWorkerRunning(false);
  };

  /** LightRAG LayoutsControl: sync layouts animate; worker layouts relax on a
   *  time budget bound to the LIVE graph (their stale-graph fix, kept). */
  const runLayout = async (name: LayoutName) => {
    const h = handleRef.current;
    if (!h) return;
    setLayout(name);
    setLayoutMenu(false);
    stopWorker();
    const { graph, renderer } = h;
    if ((SYNC_LAYOUTS as readonly string[]).includes(name)) {
      const [{ animateNodes }, circularMod, circlepackMod, randomMod] = await Promise.all([
        import("sigma/utils"),
        import("graphology-layout/circular"),
        import("graphology-layout/circlepack"),
        import("graphology-layout/random"),
      ]);
      const algo =
        name === "Circular"
          ? circularMod.default
          : name === "Circlepack"
            ? circlepackMod.default
            : randomMod.default;
      const positions = algo(graph as never) as Record<string, { x: number; y: number }>;
      if (graph.order <= ANIMATE_NODE_LIMIT) {
        animateNodes(graph, positions, { duration: 400 });
      } else {
        for (const [id, pos] of Object.entries(positions)) {
          graph.setNodeAttribute(id, "x", pos.x);
          graph.setNodeAttribute(id, "y", pos.y);
        }
      }
      renderer.refresh();
      return;
    }
    const sup = await buildSupervisor(name as (typeof WORKER_LAYOUTS)[number], graph);
    if (!sup) return;
    supervisorRef.current = sup;
    sup.start();
    setWorkerRunning(true);
    budgetTimerRef.current = window.setTimeout(() => {
      try {
        sup.stop();
      } catch {
        /* fine */
      }
      setWorkerRunning(false);
    }, workerBudgetMs(graph.order));
  };

  const toggleWorker = () => {
    const sup = supervisorRef.current;
    if (!sup) {
      void runLayout(layout);
      return;
    }
    if (sup.isRunning()) {
      sup.stop();
      setWorkerRunning(false);
    } else {
      sup.start();
      setWorkerRunning(true);
    }
  };

  // Camera controls (LightRAG ZoomControl).
  const camera = () => handleRef.current?.renderer.getCamera();
  const zoomIn = () => void camera()?.animatedZoom({ duration: 200 });
  const zoomOut = () => void camera()?.animatedUnzoom({ duration: 200 });
  const zoomFit = () => {
    const h = handleRef.current;
    if (!h) return;
    h.renderer.setCustomBBox(null);
    void h.renderer.getCamera().animatedReset({ duration: 300 });
  };

  // Fullscreen (LightRAG FullScreenControl).
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement === rootRef.current) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  };

  // Search → select + focus (LightRAG GraphSearch + FocusOnNode).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 20);
  }, [query, nodes]);
  const pickNode = (n: WikiNode) => {
    setQuery("");
    setSelected(n);
    handleRef.current?.selectNode(n.id);
    handleRef.current?.focusNode(n.id);
    onSelect?.(n);
  };

  // The properties card docks below the canvas and shrinks it — re-center the
  // selected node (at the current zoom) so it never ends up hidden under the
  // fold after the layout shift.
  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      const h = handleRef.current;
      if (!h) return;
      const data = h.renderer.getNodeDisplayData(selected.id);
      if (data) void h.renderer.getCamera().animate({ x: data.x, y: data.y }, { duration: 300 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selected]);

  // Type legend + neighbor relations for the properties card.
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);
  const relations = useMemo(() => {
    if (!selected) return [];
    const out: { node: WikiNode; kind: string }[] = [];
    for (const e of edges) {
      const other = e.from === selected.id ? e.to : e.to === selected.id ? e.from : null;
      if (!other) continue;
      const n = nodeById.get(other);
      if (n) out.push({ node: n, kind: e.type });
    }
    return out;
  }, [selected, edges, nodeById]);

  if (nodes.length === 0) {
    return <div className="p-4 text-[13px] text-muted">{t("No graph yet for this wiki.")}</div>;
  }

  return (
    <div ref={rootRef} className="flex h-full w-full flex-col overflow-hidden bg-surface">
      <div className="relative min-h-0 flex-1">
      <div ref={hostRef} className="h-full w-full" />

      {/* Search (top-left) */}
      <div className="absolute left-3 top-3 w-56">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search nodes")}
            className="w-full rounded-input border border-border bg-surface py-1 pl-7 pr-2 text-[13px] text-text shadow-card outline-none placeholder:text-muted"
          />
        </div>
        {matches.length > 0 && (
          <div className="mt-1 max-h-64 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-pop">
            {matches.map((n) => (
              <button
                key={n.id}
                onClick={() => pickNode(n)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] text-text hover:bg-surface-2"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: wikiTypeColor(n.type) }}
                />
                <span className="truncate">{n.label}</span>
                <span className="ml-auto text-[10px] text-muted">{n.type}</span>
              </button>
            ))}
          </div>
        )}
        {/* Legend — opaque like the other overlays, so edges and nodes never
            show through the swatch labels. */}
        <div className="mt-2 flex max-w-[320px] flex-wrap gap-x-3 gap-y-1 rounded-card border border-border bg-surface px-2 py-1.5 shadow-card">
          {typeCounts.map(([type, n]) => (
            <span key={type} className="flex items-center gap-1 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: wikiTypeColor(type) }} />
              {type} <span>{n}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Toolbar (left, vertical — LightRAG's control rail) */}
      <div className="absolute bottom-10 left-3 flex flex-col gap-0.5 rounded-card border border-border bg-surface p-0.5 shadow-card">
        <RailBtn label={workerRunning ? t("Pause layout") : t("Run layout")} onClick={toggleWorker}>
          {workerRunning ? <Pause size={14} /> : <Play size={14} />}
        </RailBtn>
        <div className="relative">
          <RailBtn label={t("Layout")} onClick={() => setLayoutMenu((m) => !m)}>
            <GripVertical size={14} />
          </RailBtn>
          {layoutMenu && (
            <div className="absolute bottom-0 left-full z-20 ml-1 w-40 rounded-card border border-border bg-surface p-1 shadow-pop">
              {ALL_LAYOUTS.map((name) => (
                <button
                  key={name}
                  onClick={() => void runLayout(name)}
                  className={cn(
                    "block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-surface-2",
                    name === layout ? "font-medium text-text" : "text-text",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <RailBtn label={t("Zoom in")} onClick={zoomIn}>
          <Plus size={14} />
        </RailBtn>
        <RailBtn label={t("Zoom out")} onClick={zoomOut}>
          <Minus size={14} />
        </RailBtn>
        <RailBtn label={t("Fit view")} onClick={zoomFit}>
          <Maximize size={14} />
        </RailBtn>
        <RailBtn label={t("Fullscreen")} onClick={toggleFullscreen}>
          <Expand size={14} className={cn(fullscreen && "text-accent")} />
        </RailBtn>
      </div>

      {/* Counts footer (LightRAG's status strip) */}
      <div className="absolute bottom-3 left-3 text-[11px] text-muted">
        {t("{a} pages · {b} relations")
          .replace("{a}", String(nodes.length))
          .replace("{b}", String(edges.length))}
      </div>
      </div>

      {/* Node properties card (LightRAG PropertiesView) — docked BELOW the
          canvas rather than floating over it, so it can never hide the very
          neighborhood it describes. */}
      {selected && (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-accent">{t("Node")}</span>
            <div className="flex-1" />
            <button
              className="text-muted hover:text-text"
              aria-label={t("Close")}
              onClick={() => {
                setSelected(null);
                handleRef.current?.selectNode(null);
              }}
            >
              <X size={12} />
            </button>
          </div>
          <PropRow k="ID" v={selected.id} />
          <PropRow k={t("Label")} v={selected.label} />
          <PropRow k={t("Type")} v={selected.type} />
          <PropRow k={t("Degree")} v={String(selected.degree)} />
          {relations.length > 0 && (
            <>
              <div className="mt-2 text-[12px] font-medium text-green-700">
                {t("Relations")} ({relations.length})
              </div>
              {relations.map((r, i) => (
                <button
                  key={`${r.node.id}-${i}`}
                  onClick={() => pickNode(r.node)}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[12px] text-text hover:bg-surface-2"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: wikiTypeColor(r.node.type) }}
                  />
                  <span className="truncate">{r.node.label}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted">{r.kind}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RailBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  );
}

function PropRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="mt-1 flex gap-2 text-[12px]">
      <span className="shrink-0 text-muted">{k}</span>
      <span className="min-w-0 break-all text-text">{v}</span>
    </div>
  );
}

async function buildSupervisor(
  name: (typeof WORKER_LAYOUTS)[number],
  graph: unknown,
): Promise<Supervisor | null> {
  const order = (graph as { order: number }).order;
  // LightRAG's buildSupervisor, verbatim settings — including their fix of
  // binding to the LIVE graph rather than a stale mount-time one.
  switch (name) {
    case "Force Atlas": {
      const [{ default: forceAtlas2 }, { default: FA2 }] = await Promise.all([
        import("graphology-layout-forceatlas2"),
        import("graphology-layout-forceatlas2/worker"),
      ]);
      return new FA2(graph as never, {
        settings: forceAtlas2.inferSettings(order),
      }) as unknown as Supervisor;
    }
    case "Force Directed": {
      const { default: ForceSupervisor } = await import("graphology-layout-force/worker");
      return new ForceSupervisor(graph as never, {
        settings: { attraction: 0.0003, repulsion: 0.02, gravity: 0.02, inertia: 0.8, maxMove: 5 },
      }) as unknown as Supervisor;
    }
    case "Noverlaps": {
      const { default: NoverlapSupervisor } = await import("graphology-layout-noverlap/worker");
      return new NoverlapSupervisor(graph as never, {
        settings: { margin: 10, expansion: 1.1, gridSize: 1, ratio: 1, speed: 3 },
      }) as unknown as Supervisor;
    }
    default:
      return null;
  }
}
