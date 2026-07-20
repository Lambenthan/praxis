// The literature-graph render engine, ported from Quartz v4.5.2's
// graph.inline.ts (github.com/jackyzha0/quartz, MIT) — the same viewer the
// EmpiricalWiki `tools/view.sh` site uses, so the app graph matches that look
// exactly: d3-force simulation virtualized behind a pixi.js WebGL canvas,
// tweened hover fades, zoom-dependent label opacity, drag with a <500 ms
// click gate. Adaptations from the original are ONLY at the seams: nodes
// come from edges.jsonl instead of the content index, node color encodes the
// wiki entity type, and a click hands the node to `onSelect` instead of SPA
// navigation. Physics parameters are the ones the user's own Quartz site
// runs (view.sh globalGraph overrides).
import {
  type SimulationNodeDatum,
  type SimulationLinkDatum,
  type Simulation,
  forceSimulation,
  forceManyBody,
  forceCenter,
  forceLink,
  forceCollide,
  forceRadial,
  forceX,
  forceY,
  zoomIdentity,
  select,
  drag,
  zoom,
} from "d3";
import { Text, Graphics, Application, Container, Circle } from "pixi.js";
import { Group as TweenGroup, Tween as Tweened } from "@tweenjs/tween.js";
import { wikiTypeColor, type WikiEdge, type WikiNode } from "@/lib/wikiGraph";

type GraphicsInfo = {
  color: string;
  gfx: Graphics;
  alpha: number;
  active: boolean;
};

type NodeData = {
  id: string;
  text: string;
  type: string;
} & SimulationNodeDatum;

type LinkData = {
  source: NodeData;
  target: NodeData;
} & SimulationLinkDatum<NodeData>;

type LinkRenderData = GraphicsInfo & { simulationData: LinkData };
type NodeRenderData = GraphicsInfo & { simulationData: NodeData; label: Text };

type TweenNode = {
  update: (time: number) => void;
  stop: () => void;
};

/** The user's own Quartz site config: globalGraph defaults + the view.sh
 *  overrides (showTags off, repel 0.8, linkDistance 35, scale 1.05). */
const CFG = {
  drag: true,
  zoom: true,
  scale: 1.05,
  repelForce: 0.8,
  centerForce: 0.2,
  linkDistance: 35,
  fontSize: 0.6,
  opacityScale: 3,
  focusOnHover: true,
  enableRadial: true,
};

/** Quartz theme slots mapped onto the app's palette (pixi can't read CSS
 *  variables, same reason Quartz precomputes them). */
const STYLE = {
  gray: "#9CA3AF", // hovered-link color
  lightgray: "#D9DDE3", // resting links
  dark: "#1E2A3A", // labels (app ink)
  bodyFont: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', sans-serif",
};

export async function renderWikiGraph(
  graph: HTMLElement,
  nodes: WikiNode[],
  edges: WikiEdge[],
  onSelect: (node: WikiNode) => void,
): Promise<() => void> {
  const {
    drag: enableDrag,
    zoom: enableZoom,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    focusOnHover,
    enableRadial,
  } = CFG;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const graphNodes: NodeData[] = nodes.map((n) => ({ id: n.id, text: n.label, type: n.type }));
  const nodeDataById = new Map(graphNodes.map((n) => [n.id, n]));
  const graphLinks: LinkData[] = edges
    .filter((e) => nodeDataById.has(e.from) && nodeDataById.has(e.to))
    .map((e) => ({ source: nodeDataById.get(e.from)!, target: nodeDataById.get(e.to)! }));
  const graphData = { nodes: graphNodes, links: graphLinks };

  const width = graph.offsetWidth;
  const height = Math.max(graph.offsetHeight, 250);
  const spread = Math.max(1, Math.min(width, height) / 420);
  const radiusScale = Math.sqrt(spread);

  // we virtualize the simulation and use pixi to actually render it
  const simulation: Simulation<NodeData, LinkData> = forceSimulation<NodeData>(graphData.nodes)
    .force("charge", forceManyBody().strength(-100 * repelForce * spread))
    .force("center", forceCenter().strength(centerForce))
    .force("link", forceLink(graphData.links).distance(linkDistance * spread))
    .force("collide", forceCollide<NodeData>((n) => nodeRadius(n)).iterations(3));

  const radius = (Math.min(width, height) / 2) * 0.8;
  const useRadial = enableRadial && graphData.nodes.length > 80;
  if (useRadial) simulation.force("radial", forceRadial(radius).strength(0.2));
  else {
    simulation.force("x", forceX(0).strength(0.08));
    simulation.force("y", forceY(0).strength(0.08));
  }

  // Settle the simulation enough to know the graph's extent, then start the
  // view fitted to it — Obsidian's graph opens framed on the content, not at
  // 1:1 where a small wiki is a distant speck (the ugliness the hand-rolled
  // engine shipped with). The animation continues from the warm state.
  simulation.tick(80);
  // The animate loop draws a node at stage coords (sim + width/2, sim + height/2)
  // and the zoom handler applies screen = stage * k + t; centering the extent's
  // midpoint therefore needs t = viewportCenter - stageMidpoint * k.
  const fitTransform = () => {
    let ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const n of graphData.nodes) {
      ext = {
        x0: Math.min(ext.x0, n.x ?? 0),
        y0: Math.min(ext.y0, n.y ?? 0),
        x1: Math.max(ext.x1, n.x ?? 0),
        y1: Math.max(ext.y1, n.y ?? 0),
      };
    }
    const spanX = Math.max(ext.x1 - ext.x0, 1);
    const spanY = Math.max(ext.y1 - ext.y0, 1);
    const fitK = Math.min(Math.min(width / spanX, height / spanY) * 0.72, 1.3);
    const midX = (ext.x0 + ext.x1) / 2 + width / 2;
    const midY = (ext.y0 + ext.y1) / 2 + height / 2;
    return zoomIdentity.translate(width / 2 - midX * fitK, height / 2 - midY * fitK).scale(fitK);
  };
  const initialTransform = fitTransform();

  const color = (d: NodeData) => wikiTypeColor(d.type);

  function nodeRadius(d: NodeData) {
    const numLinks = graphData.links.filter(
      (l) => l.source.id === d.id || l.target.id === d.id,
    ).length;
    return (2 + Math.sqrt(numLinks)) * radiusScale;
  }

  let hoveredNodeId: string | null = null;
  let hoveredNeighbours: Set<string> = new Set();
  const linkRenderData: LinkRenderData[] = [];
  const nodeRenderData: NodeRenderData[] = [];
  const tweens = new Map<string, TweenNode>();

  function updateHoverInfo(newHoveredId: string | null) {
    hoveredNodeId = newHoveredId;

    if (newHoveredId === null) {
      hoveredNeighbours = new Set();
      for (const n of nodeRenderData) n.active = false;
      for (const l of linkRenderData) l.active = false;
    } else {
      hoveredNeighbours = new Set();
      for (const l of linkRenderData) {
        const linkData = l.simulationData;
        if (linkData.source.id === newHoveredId || linkData.target.id === newHoveredId) {
          hoveredNeighbours.add(linkData.source.id);
          hoveredNeighbours.add(linkData.target.id);
        }
        l.active = linkData.source.id === newHoveredId || linkData.target.id === newHoveredId;
      }
      for (const n of nodeRenderData) {
        n.active = hoveredNeighbours.has(n.simulationData.id);
      }
    }
  }

  let dragStartTime = 0;
  let dragging = false;

  function renderLinks() {
    tweens.get("link")?.stop();
    const tweenGroup = new TweenGroup();

    for (const l of linkRenderData) {
      let alpha = 1;
      // if we are hovering over a node, we want to highlight the immediate neighbours
      // with full alpha and the rest with default alpha
      if (hoveredNodeId) alpha = l.active ? 1 : 0.2;
      l.color = l.active ? STYLE.gray : STYLE.lightgray;
      tweenGroup.add(new Tweened<LinkRenderData>(l).to({ alpha }, 200));
    }

    tweenGroup.getAll().forEach((tw) => tw.start());
    tweens.set("link", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop());
      },
    });
  }

  function renderLabels() {
    tweens.get("label")?.stop();
    const tweenGroup = new TweenGroup();

    const defaultScale = 1 / scale;
    const activeScale = defaultScale * 1.1;
    for (const n of nodeRenderData) {
      const nodeId = n.simulationData.id;
      if (hoveredNodeId === nodeId) {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            { alpha: 1, scale: { x: activeScale, y: activeScale } },
            100,
          ),
        );
      } else {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            { alpha: n.label.alpha, scale: { x: defaultScale, y: defaultScale } },
            100,
          ),
        );
      }
    }

    tweenGroup.getAll().forEach((tw) => tw.start());
    tweens.set("label", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop());
      },
    });
  }

  function renderNodes() {
    tweens.get("hover")?.stop();

    const tweenGroup = new TweenGroup();
    for (const n of nodeRenderData) {
      let alpha = 1;
      // if we are hovering over a node, we want to highlight the immediate neighbours
      if (hoveredNodeId !== null && focusOnHover) alpha = n.active ? 1 : 0.2;
      tweenGroup.add(new Tweened<Graphics>(n.gfx, tweenGroup).to({ alpha }, 200));
    }

    tweenGroup.getAll().forEach((tw) => tw.start());
    tweens.set("hover", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop());
      },
    });
  }

  function renderPixiFromD3() {
    renderNodes();
    renderLinks();
    renderLabels();
  }

  tweens.forEach((tween) => tween.stop());
  tweens.clear();

  const app = new Application();
  await app.init({
    width,
    height,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: "webgpu",
    resolution: window.devicePixelRatio,
    eventMode: "static",
  });
  graph.appendChild(app.canvas);

  const stage = app.stage;
  stage.interactive = false;

  const labelsContainer = new Container<Text>({ zIndex: 3, isRenderGroup: true });
  const nodesContainer = new Container<Graphics>({ zIndex: 2, isRenderGroup: true });
  const linkContainer = new Container<Graphics>({ zIndex: 1, isRenderGroup: true });
  stage.addChild(nodesContainer, labelsContainer, linkContainer);

  for (const n of graphData.nodes) {
    const nodeId = n.id;

    const label = new Text({
      interactive: false,
      eventMode: "none",
      text: n.text,
      alpha: 0,
      anchor: { x: 0.5, y: 1.2 },
      style: {
        fontSize: fontSize * 15,
        fill: STYLE.dark,
        fontFamily: STYLE.bodyFont,
      },
      resolution: window.devicePixelRatio * 4,
    });
    label.scale.set(1 / scale);

    let oldLabelOpacity = 0;
    const gfx = new Graphics({
      interactive: true,
      label: nodeId,
      eventMode: "static",
      hitArea: new Circle(0, 0, nodeRadius(n)),
      cursor: "pointer",
    })
      .circle(0, 0, nodeRadius(n))
      .fill({ color: color(n) })
      .on("pointerover", (e) => {
        updateHoverInfo((e.target as Graphics).label);
        oldLabelOpacity = label.alpha;
        if (!dragging) renderPixiFromD3();
      })
      .on("pointerleave", () => {
        updateHoverInfo(null);
        label.alpha = oldLabelOpacity;
        if (!dragging) renderPixiFromD3();
      });

    nodesContainer.addChild(gfx);
    labelsContainer.addChild(label);

    nodeRenderData.push({
      simulationData: n,
      gfx,
      label,
      color: color(n),
      alpha: 1,
      active: false,
    });
  }

  for (const l of graphData.links) {
    const gfx = new Graphics({ interactive: false, eventMode: "none" });
    linkContainer.addChild(gfx);
    linkRenderData.push({
      simulationData: l,
      gfx,
      color: STYLE.lightgray,
      alpha: 1,
      active: false,
    });
  }

  const selectNode = (id: string) => {
    const found = byId.get(id);
    if (found) onSelect(found);
  };

  let currentTransform = zoomIdentity;
  if (enableDrag) {
    select<HTMLCanvasElement, NodeData | undefined>(app.canvas).call(
      drag<HTMLCanvasElement, NodeData | undefined>()
        .container(() => app.canvas)
        .subject(() => graphData.nodes.find((n) => n.id === hoveredNodeId))
        .on("start", function dragstarted(event) {
          if (!event.active) simulation.alphaTarget(1).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
          event.subject.__initialDragPos = {
            x: event.subject.x,
            y: event.subject.y,
            fx: event.subject.fx,
            fy: event.subject.fy,
          };
          dragStartTime = Date.now();
          dragging = true;
        })
        .on("drag", function dragged(event) {
          const initPos = event.subject.__initialDragPos;
          event.subject.fx = initPos.x + (event.x - initPos.x) / currentTransform.k;
          event.subject.fy = initPos.y + (event.y - initPos.y) / currentTransform.k;
        })
        .on("end", function dragended(event) {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
          dragging = false;

          // if the time between mousedown and mouseup is short, we consider it a click
          if (Date.now() - dragStartTime < 500) {
            selectNode((event.subject as NodeData).id);
          }
        }),
    );
  } else {
    for (const node of nodeRenderData) {
      node.gfx.on("click", () => selectNode(node.simulationData.id));
    }
  }

  const zoomBehavior = zoom<HTMLCanvasElement, NodeData>()
    .extent([
      [0, 0],
      [width, height],
    ])
    .scaleExtent([0.25, 8])
    .on("zoom", ({ transform }) => {
      currentTransform = transform;
      stage.scale.set(transform.k, transform.k);
      stage.position.set(transform.x, transform.y);

      // zoom adjusts opacity of labels too
      const scaled = transform.k * opacityScale;
      const scaleOpacity = Math.max((scaled - 1) / 3.75, 0);
      const activeNodes = nodeRenderData.filter((n) => n.active).flatMap((n) => n.label);

      for (const label of labelsContainer.children) {
        if (!activeNodes.includes(label)) {
          label.alpha = scaleOpacity;
        }
      }
    });
  const canvasSelection = select<HTMLCanvasElement, NodeData>(app.canvas);
  if (enableZoom) canvasSelection.call(zoomBehavior);
  // Open framed on the content (see the fit computation above).
  canvasSelection.call(zoomBehavior.transform, initialTransform);
  let userTouchedView = false;
  app.canvas.addEventListener("pointerdown", () => (userTouchedView = true), { once: true });
  app.canvas.addEventListener("wheel", () => (userTouchedView = true), { once: true });
  simulation.on("end", () => {
    if (userTouchedView) return; // never fight the user for the camera
    canvasSelection.transition().duration(600).call(zoomBehavior.transform, fitTransform());
  });

  let stopAnimation = false;
  function animate(time: number) {
    if (stopAnimation) return;
    for (const n of nodeRenderData) {
      const { x, y } = n.simulationData;
      if (!x || !y) continue;
      n.gfx.position.set(x + width / 2, y + height / 2);
      if (n.label) n.label.position.set(x + width / 2, y + height / 2);
    }

    for (const l of linkRenderData) {
      const linkData = l.simulationData;
      l.gfx.clear();
      l.gfx.moveTo(linkData.source.x! + width / 2, linkData.source.y! + height / 2);
      l.gfx
        .lineTo(linkData.target.x! + width / 2, linkData.target.y! + height / 2)
        .stroke({ alpha: l.alpha, width: 1, color: l.color });
    }

    tweens.forEach((t) => t.update(time));
    app.renderer.render(stage);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
  return () => {
    stopAnimation = true;
    simulation.stop();
    tweens.forEach((t) => t.stop());
    app.canvas.remove();
    app.destroy(true, { children: true });
  };
}
