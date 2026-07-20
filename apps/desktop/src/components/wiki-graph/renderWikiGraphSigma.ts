// The "LightRAG" literature-graph engine, adapted from LightRAG's WebUI
// (github.com/HKUDS/LightRAG, MIT) — sigma.js v3 rendering with the same
// visual system their knowledge-graph viewer uses: bordered nodes sized
// 4–20px by sqrt-scaled degree, ForceAtlas2 worker layout with inferred
// settings and a time budget, curved edges on small graphs, hover reducers
// that highlight the focused neighborhood and grey out the rest, node
// dragging, and click-to-select. Adaptation seams only: nodes/edges come
// from the wiki's edges.jsonl, node colors encode the wiki entity type, and
// a click hands the node to `onSelect`.
import Graph from "graphology";
import { circular } from "graphology-layout";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2LayoutSupervisor from "graphology-layout-forceatlas2/worker";
import Sigma from "sigma";
import {
  EdgeLineProgram,
  EdgeRectangleProgram,
  NodeCircleProgram,
  NodePointProgram,
} from "sigma/rendering";
import { NodeBorderProgram } from "@sigma/node-border";
import { createEdgeCurveProgram } from "@sigma/edge-curve";
import { wikiTypeColor, type WikiEdge, type WikiNode } from "@/lib/wikiGraph";

// LightRAG's constants.ts values (light theme).
const MIN_NODE_SIZE = 4;
const MAX_NODE_SIZE = 20;
const NODE_COLOR_DISABLED = "#E2E2E2";
const NODE_BORDER_COLOR_SELECTED = "#F57F17";
const EDGE_COLOR_HIGHLIGHTED = "#F57F17";
const EDGE_COLOR_DEFAULT = "#d3d3d3";
const EDGE_PERF_LIMIT = 5000;
const workerBudgetMs = (order: number): number => Math.min(1500 + order / 10, 10000);

/** Imperative handle over the mounted graph — the LightRAG-style panel
 *  (layouts / zoom / search / properties) drives the instance through this. */
export interface WikiGraphHandle {
  graph: Graph;
  renderer: Sigma;
  /** Programmatic selection (search hit, relations click); null clears. */
  selectNode: (id: string | null) => void;
  /** Animate the camera onto a node (LightRAG's gotoNode). */
  focusNode: (id: string) => void;
  dispose: () => void;
}

export function renderWikiGraphSigma(
  host: HTMLElement,
  nodes: WikiNode[],
  edges: WikiEdge[],
  onSelect: (node: WikiNode | null) => void,
): () => void {
  return mountWikiGraph(host, nodes, edges, onSelect).dispose;
}

export function mountWikiGraph(
  host: HTMLElement,
  nodes: WikiNode[],
  edges: WikiEdge[],
  /** Called with the clicked node, or null when a stage click clears it. */
  onSelect: (node: WikiNode | null) => void,
): WikiGraphHandle {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // ---- graphology graph with LightRAG's node sizing ------------------------
  const graph = new Graph({ multi: true });
  let minDegree = Number.MAX_SAFE_INTEGER;
  let maxDegree = 0;
  for (const n of nodes) {
    minDegree = Math.min(minDegree, n.degree);
    maxDegree = Math.max(maxDegree, n.degree);
  }
  const range = Math.max(maxDegree - minDegree, 0);
  const scale = MAX_NODE_SIZE - MIN_NODE_SIZE;
  for (const n of nodes) {
    const size =
      range > 0
        ? Math.round(MIN_NODE_SIZE + scale * Math.pow((n.degree - minDegree) / range, 0.5))
        : MIN_NODE_SIZE + 4;
    graph.addNode(n.id, {
      label: n.label,
      color: wikiTypeColor(n.type),
      borderColor: "#FFFFFF",
      size,
      x: 0,
      y: 0,
    });
  }
  for (const e of edges) {
    if (graph.hasNode(e.from) && graph.hasNode(e.to)) {
      graph.addEdge(e.from, e.to, { size: 1, edgeType: e.type });
    }
  }
  circular.assign(graph); // FA2 needs starting coordinates

  // ---- sigma instance with LightRAG's settings -----------------------------
  const curved = graph.size > 0 && graph.size <= EDGE_PERF_LIMIT;
  const renderer = new Sigma(graph, host, {
    allowInvalidContainer: true,
    defaultNodeType: "border",
    defaultEdgeType: curved ? "curvedNoArrow" : "rect",
    renderEdgeLabels: false,
    hideEdgesOnMove: true,
    edgeProgramClasses: {
      rect: EdgeRectangleProgram,
      line: EdgeLineProgram,
      curvedNoArrow: createEdgeCurveProgram(),
    },
    nodeProgramClasses: {
      point: NodePointProgram,
      default: NodePointProgram,
      circle: NodeCircleProgram,
      border: NodeBorderProgram,
    },
    labelGridCellSize: 60,
    labelRenderedSizeThreshold: 8,
    enableEdgeEvents: false,
    defaultEdgeColor: EDGE_COLOR_DEFAULT,
    labelColor: { color: "#000", attribute: "labelColor" },
    labelSize: 12,
    // Keep the auto-fitted graph clear of the overlay chrome (search box,
    // legend, toolbar) instead of letting nodes slide underneath it.
    stagePadding: 64,
  });

  // ---- ForceAtlas2 worker layout with time budget --------------------------
  let layout: FA2LayoutSupervisor | null = null;
  try {
    layout = new FA2LayoutSupervisor(graph, {
      settings: forceAtlas2.inferSettings(graph.order),
    });
    layout.start();
  } catch {
    // worker unavailable — fall back to a synchronous layout pass
    forceAtlas2.assign(graph, { iterations: 120, settings: forceAtlas2.inferSettings(graph.order) });
  }
  const budgetTimer = window.setTimeout(() => {
    try {
      layout?.stop();
      renderer.setCustomBBox(null);
      renderer.refresh();
    } catch {
      /* already killed */
    }
  }, workerBudgetMs(graph.order));

  // ---- hover: highlight the focused neighborhood (LightRAG reducers) -------
  let focusedNode: string | null = null;
  let selectedNode: string | null = null;

  function applyReducers() {
    const focused = focusedNode || selectedNode;
    if (!focused || !graph.hasNode(focused)) {
      renderer.setSetting("nodeReducer", null);
      renderer.setSetting("edgeReducer", null);
      return;
    }
    const neighborSet = new Set<string>();
    graph.forEachNeighbor(focused, (n) => neighborSet.add(n));

    renderer.setSetting("nodeReducer", (node, data) => {
      const newData: typeof data & { highlighted: boolean; borderColor?: string } = {
        ...data,
        highlighted: false,
      };
      if (node === focused || neighborSet.has(node)) {
        newData.highlighted = true;
        if (node === selectedNode) {
          newData.borderColor = NODE_BORDER_COLOR_SELECTED;
        }
      } else {
        newData.color = NODE_COLOR_DISABLED;
      }
      return newData;
    });
    renderer.setSetting("edgeReducer", (edge, data) => {
      const newData = { ...data, hidden: false as boolean, color: EDGE_COLOR_DEFAULT };
      const touchesFocused = graph.source(edge) === focused || graph.target(edge) === focused;
      if (touchesFocused) newData.color = EDGE_COLOR_HIGHLIGHTED;
      return newData;
    });
  }

  // ---- node dragging (LightRAG GraphEvents pattern) ------------------------
  let draggedNode: string | null = null;
  let dragMoved = false;

  renderer.on("enterNode", (e) => {
    focusedNode = e.node;
    applyReducers();
    renderer.refresh();
  });
  renderer.on("leaveNode", () => {
    focusedNode = null;
    applyReducers();
    renderer.refresh();
  });
  renderer.on("downNode", (e) => {
    draggedNode = e.node;
    dragMoved = false;
    graph.setNodeAttribute(e.node, "highlighted", true);
  });
  renderer.getMouseCaptor().on("mousemovebody", (e) => {
    if (!draggedNode) return;
    dragMoved = true;
    const pos = renderer.viewportToGraph(e);
    graph.setNodeAttribute(draggedNode, "x", pos.x);
    graph.setNodeAttribute(draggedNode, "y", pos.y);
    e.preventSigmaDefault();
    e.original.preventDefault();
    e.original.stopPropagation();
  });
  renderer.getMouseCaptor().on("mouseup", () => {
    if (draggedNode) {
      graph.removeNodeAttribute(draggedNode, "highlighted");
      draggedNode = null;
    }
  });
  renderer.on("clickNode", (e) => {
    if (dragMoved) return; // a drag, not a click
    selectedNode = e.node;
    applyReducers();
    renderer.refresh();
    const found = byId.get(e.node);
    if (found) onSelect(found);
  });
  renderer.on("clickStage", () => {
    selectedNode = null;
    focusedNode = null;
    applyReducers();
    renderer.refresh();
    onSelect(null);
  });

  return {
    graph,
    renderer,
    selectNode: (id) => {
      selectedNode = id;
      applyReducers();
      renderer.refresh();
    },
    focusNode: (id) => {
      const data = renderer.getNodeDisplayData(id);
      if (data) void renderer.getCamera().animate({ x: data.x, y: data.y, ratio: 0.5 }, { duration: 400 });
    },
    dispose: () => {
      window.clearTimeout(budgetTimer);
      try {
        layout?.kill();
      } catch {
        /* already dead */
      }
      renderer.kill();
    },
  };
}
