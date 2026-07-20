import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WikiGraphView } from "./WikiGraphView";
import type { WikiNode } from "@/lib/wikiGraph";

vi.mock("@/lib/artifactFile", () => ({
  readArtifact: vi.fn(async (path: string) => ({
    encoding: "utf8",
    data: `---\ntitle: "耐心资本"\n---\n\n## Definition\n熵值法综合指标 for ${path}`,
  })),
}));

// The pixi/WebGL engine can't run in jsdom — capture the select callback so the
// test can drive a node click exactly as the canvas would.
let capturedOnSelect: ((n: WikiNode) => void) | null = null;
vi.mock("./renderWikiGraph", () => ({
  renderWikiGraph: vi.fn(
    async (_el: HTMLElement, _nodes: unknown, _edges: unknown, onSelect: (n: WikiNode) => void) => {
      capturedOnSelect = onSelect;
      return () => {};
    },
  ),
}));

const text = [
  '{"from": "papers/邱蓉-2024", "to": "variables/耐心资本", "type": "operationalizes", "confidence": "high"}',
  '{"from": "papers/邱蓉-2024", "to": "datasets/csmar", "type": "uses_dataset", "confidence": "high"}',
  '{"from": "papers/edmans-2009", "to": "propositions/p2", "type": "proves"}',
].join("\n");

describe("WikiGraphView", () => {
  it("renders the legend and hands nodes/edges to the graph engine", async () => {
    const { renderWikiGraph } = await import("./renderWikiGraph");
    render(<WikiGraphView path="wiki/graph/edges.jsonl" text={text} root="workspace" />);
    await waitFor(() => expect(renderWikiGraph).toHaveBeenCalled());
    const [, nodes, edges] = vi.mocked(renderWikiGraph).mock.calls[0];
    expect(nodes).toHaveLength(5);
    expect(edges).toHaveLength(3);
    // legend counts pages and relations, one chip per entity type
    expect(screen.getByText("papers")).toBeTruthy();
    expect(screen.getByText("variables")).toBeTruthy();
  });

  it("opens the card panel when the engine reports a node click", async () => {
    render(<WikiGraphView path="wiki/graph/edges.jsonl" text={text} root="workspace" />);
    await waitFor(() => expect(capturedOnSelect).not.toBeNull());
    capturedOnSelect!({ id: "variables/耐心资本", type: "variables", label: "耐心资本", degree: 1 });
    await waitFor(() => {
      expect(screen.getByText("Definition")).toBeTruthy();
    });
    // frontmatter is stripped from the rendered card
    expect(screen.queryByText(/title:/)).toBeNull();
  });

  it("shows the empty-state note for an empty graph", () => {
    render(<WikiGraphView path="wiki/graph/edges.jsonl" text="" root="workspace" />);
    expect(screen.getByText(/knowledge graph is empty/i)).toBeTruthy();
  });
});
