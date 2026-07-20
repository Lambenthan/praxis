import { useEffect, useMemo, useRef, useState } from "react";
import type { FileRoot } from "@fishes/shared";
import {
  buildNodes,
  parseWikiEdges,
  wikiRootFromEdgesPath,
  wikiTypeColor,
  type WikiNode,
} from "@/lib/wikiGraph";
import { WikiCardPanel } from "./WikiCardPanel";
import { useT } from "@/lib/i18n";

export type GraphEngine = "obsidian" | "lightrag";

/**
 * The literature wiki's knowledge graph with two switchable renderers to
 * compare side by side: "obsidian" (the Quartz engine — pixi + d3-force,
 * the Obsidian-graph look) and "lightrag" (the LightRAG engine — sigma.js +
 * ForceAtlas2, bordered nodes). When `onSelect` is provided the parent owns
 * what a node click opens; otherwise a built-in card panel renders the
 * clicked node's wiki card beside the graph.
 */
export function WikiGraphView({
  path,
  text,
  root,
  engine = "obsidian",
  onSelect,
}: {
  path: string;
  text: string;
  root?: FileRoot;
  engine?: GraphEngine;
  onSelect?: (node: WikiNode) => void;
}) {
  const t = useT();
  const edges = useMemo(() => parseWikiEdges(text), [text]);
  const nodes = useMemo(() => buildNodes(edges), [edges]);
  const wikiRoot = useMemo(() => wikiRootFromEdgesPath(path), [path]);

  const [selected, setSelected] = useState<WikiNode | null>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  // Parent-owned selection wins; the internal panel is the fallback.
  const select = onSelect ?? setSelected;
  const selectRef = useRef(select);
  selectRef.current = select;

  useEffect(() => {
    if (edges.length === 0) return;
    const host = canvasHost.current;
    if (!host) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    let lastW = host.offsetWidth;
    let lastH = host.offsetHeight;
    let timer: number | undefined;
    // Engines load on demand: sigma/pixi are WebGL modules that neither the
    // initial bundle nor jsdom tests should pay for.
    const start = () => {
      const onNode = (n: WikiNode | null) => {
        if (n) selectRef.current(n);
        else if (!onSelect) setSelected(null);
      };
      if (engine === "lightrag") {
        void import("./renderWikiGraphSigma").then(({ renderWikiGraphSigma }) => {
          if (cancelled) return;
          cleanup = renderWikiGraphSigma(host, nodes, edges, onNode);
        });
      } else {
        void import("./renderWikiGraph").then(({ renderWikiGraph }) =>
          renderWikiGraph(host, nodes, edges, onNode).then((c) => {
            if (cancelled) c();
            else cleanup = c;
          }),
        );
      }
    };
    start();
    // Re-render only on a REAL size change — ResizeObserver always fires once
    // on observe(), which previously double-rendered the graph.
    const ro = new ResizeObserver(() => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        cleanup?.();
        cleanup = null;
        host.replaceChildren();
        start();
      }, 200);
    });
    ro.observe(host);
    return () => {
      cancelled = true;
      ro.disconnect();
      window.clearTimeout(timer);
      cleanup?.();
      host.replaceChildren();
    };
  }, [nodes, edges, engine]);

  const typesPresent = useMemo(() => {
    const count = new Map<string, number>();
    for (const n of nodes) count.set(n.type, (count.get(n.type) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  if (edges.length === 0) {
    return (
      <div className="p-4 text-sm text-muted">
        {t("The knowledge graph is empty — ingest a paper into the literature wiki first.")}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        <div ref={canvasHost} className="h-full w-full" />

        <div className="pointer-events-none absolute left-3 top-3 rounded-card border border-border bg-surface/90 px-3 py-2">
          <div className="mb-1 text-[11px] font-medium text-muted">
            {nodes.length} {t("pages")} · {edges.length} {t("relations")}
          </div>
          <div className="flex max-w-[360px] flex-wrap gap-x-3 gap-y-0.5">
            {typesPresent.map(([type, n]) => (
              <span key={type} className="inline-flex items-center gap-1 text-[11px] text-text">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: wikiTypeColor(type) }}
                />
                {type} <span className="text-muted">{n}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {!onSelect && selected && (
        <WikiCardPanel
          key={selected.id}
          node={selected}
          wikiRoot={wikiRoot}
          root={root}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
