import { describe, expect, it } from "vitest";
import {
  buildNodes,
  buildWikilinkResolver,
  computeWikiNeighbors,
  deriveEdgesFromCards,
  isWikiEdgesFile,
  mergeWikiEdges,
  parseWikiEdges,
  wikiRootFromEdgesPath,
  wikiTypeColor,
} from "./wikiGraph";

const SAMPLE = [
  '{"from": "papers/a", "to": "variables/耐心资本", "type": "operationalizes", "confidence": "high"}',
  '{"from": "papers/a", "to": "datasets/csmar", "type": "uses_dataset"}',
  '{"from": "papers/b", "to": "propositions/p1", "type": "proves"}',
  "",
  "not json at all",
  '{"missing": "fields"}',
].join("\n");

describe("parseWikiEdges", () => {
  it("parses valid lines and skips blank/malformed ones", () => {
    const edges = parseWikiEdges(SAMPLE);
    expect(edges).toHaveLength(3);
    expect(edges[0]).toMatchObject({
      from: "papers/a",
      to: "variables/耐心资本",
      type: "operationalizes",
      confidence: "high",
    });
  });

  it("returns empty for an empty file", () => {
    expect(parseWikiEdges("")).toEqual([]);
    expect(parseWikiEdges("\n\n")).toEqual([]);
  });
});

describe("buildNodes", () => {
  it("collects unique endpoints with type, CJK label, and degree", () => {
    const nodes = buildNodes(parseWikiEdges(SAMPLE));
    // papers/a, variables/耐心资本, datasets/csmar, papers/b, propositions/p1
    expect(nodes).toHaveLength(5);
    const a = nodes.find((n) => n.id === "papers/a")!;
    expect(a.type).toBe("papers");
    expect(a.degree).toBe(2);
    const v = nodes.find((n) => n.id === "variables/耐心资本")!;
    expect(v.label).toBe("耐心资本");
    expect(v.type).toBe("variables");
  });
});

describe("deriveEdgesFromCards", () => {
  const cards = [
    {
      id: "papers/耐心资本与企业高质量发展",
      text: "被解释变量 [[variables/耐心资本]]，数据来自 [[csmar]]，另见 [[variables/耐心资本]] 重复。",
    },
    { id: "variables/耐心资本", text: "由 [[papers/耐心资本与企业高质量发展]] 操作化。" },
    { id: "datasets/csmar", text: "自链 [[csmar]] 与不存在的 [[nowhere/nothing]]。" },
    { id: "concepts/漂绿行为", text: "无链接。" },
  ];

  it("derives edges from [[dir/slug]] and bare [[slug]] wikilinks", () => {
    const edges = deriveEdgesFromCards(cards);
    expect(edges).toEqual([
      { from: "papers/耐心资本与企业高质量发展", to: "variables/耐心资本", type: "links_to" },
      { from: "papers/耐心资本与企业高质量发展", to: "datasets/csmar", type: "links_to" },
      { from: "variables/耐心资本", to: "papers/耐心资本与企业高质量发展", type: "links_to" },
    ]);
  });

  it("drops self-links, dangling targets, and duplicate pairs", () => {
    const edges = deriveEdgesFromCards(cards);
    expect(edges.filter((e) => e.from === e.to)).toHaveLength(0);
    expect(edges.some((e) => e.to.startsWith("nowhere/"))).toBe(false);
    const pairs = edges.map((e) => `${e.from}->${e.to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("strips alias, heading, and .md suffixes; matches case-insensitively", () => {
    const edges = deriveEdgesFromCards([
      { id: "papers/a", text: "[[Datasets/CSMAR.md|the data]] and [[csmar#section]]" },
      { id: "datasets/csmar", text: "" },
    ]);
    expect(edges).toEqual([{ from: "papers/a", to: "datasets/csmar", type: "links_to" }]);
  });

  it("resolves an ambiguous bare slug deterministically (first sorted match)", () => {
    const edges = deriveEdgesFromCards([
      { id: "papers/x", text: "[[dup]]" },
      { id: "variables/dup", text: "" },
      { id: "concepts/dup", text: "" },
    ]);
    expect(edges).toEqual([{ from: "papers/x", to: "concepts/dup", type: "links_to" }]);
  });

  it("returns no edges for unlinked cards", () => {
    expect(deriveEdgesFromCards([{ id: "concepts/a", text: "plain text" }])).toEqual([]);
  });
});

describe("buildWikilinkResolver", () => {
  const resolve = buildWikilinkResolver([
    "concepts/代理成本",
    "variables/代理成本",
    "papers/耐心资本与企业高质量发展",
    "datasets/csmar",
  ]);

  it("resolves full ids and bare slugs, case-insensitively", () => {
    expect(resolve("variables/代理成本")).toBe("variables/代理成本");
    expect(resolve("Datasets/CSMAR")).toBe("datasets/csmar");
    expect(resolve("耐心资本与企业高质量发展")).toBe("papers/耐心资本与企业高质量发展");
  });

  it("strips alias, heading, and .md before matching", () => {
    expect(resolve("csmar|the data")).toBe("datasets/csmar");
    expect(resolve("csmar#section")).toBe("datasets/csmar");
    expect(resolve("datasets/csmar.md")).toBe("datasets/csmar");
    expect(resolve(" csmar ")).toBe("datasets/csmar");
  });

  it("resolves an ambiguous bare slug to the lexicographically first card", () => {
    expect(resolve("代理成本")).toBe("concepts/代理成本");
  });

  it("returns null for unknown targets and empty input", () => {
    expect(resolve("nowhere")).toBeNull();
    expect(resolve("no/such-card")).toBeNull();
    expect(resolve("")).toBeNull();
    expect(resolve("|alias only")).toBeNull();
  });
});

describe("mergeWikiEdges", () => {
  it("keeps the primary (typed) edge when a derived duplicate exists", () => {
    const merged = mergeWikiEdges(
      [{ from: "papers/a", to: "variables/v", type: "operationalizes" }],
      [
        { from: "papers/a", to: "variables/v", type: "links_to" },
        { from: "concepts/c", to: "papers/a", type: "links_to" },
      ],
    );
    expect(merged).toEqual([
      { from: "papers/a", to: "variables/v", type: "operationalizes" },
      { from: "concepts/c", to: "papers/a", type: "links_to" },
    ]);
  });

  it("keeps reversed pairs as distinct edges", () => {
    const merged = mergeWikiEdges(
      [{ from: "a/x", to: "b/y", type: "t" }],
      [{ from: "b/y", to: "a/x", type: "links_to" }],
    );
    expect(merged).toHaveLength(2);
  });
});

describe("computeWikiNeighbors", () => {
  const edges = parseWikiEdges(
    [
      '{"from": "papers/乙论文", "to": "variables/代理成本", "type": "operationalizes"}',
      '{"from": "papers/甲论文", "to": "variables/代理成本", "type": "measures"}',
      '{"from": "variables/代理成本", "to": "mechanisms/代理成本机制", "type": "links_to"}',
      '{"from": "concepts/委托代理", "to": "variables/代理成本", "type": "links_to"}',
      '{"from": "papers/甲论文", "to": "datasets/csmar", "type": "uses_dataset"}',
      '{"from": "papers/乙论文", "to": "variables/代理成本", "type": "cites"}',
    ].join("\n"),
  );

  it("collects both directions, papers first, sorted and deduped", () => {
    const r = computeWikiNeighbors(edges, "variables/代理成本");
    expect(r.papers.map((n) => n.label)).toEqual(["乙论文", "甲论文"]);
    expect(r.others.map((n) => n.id)).toEqual(["concepts/委托代理", "mechanisms/代理成本机制"]);
    // Deduped: 乙论文 touches the node twice but appears once, first edge wins.
    expect(r.papers.find((n) => n.label === "乙论文")?.edgeType).toBe("operationalizes");
  });

  it("labels and colors come from the id's dir/slug split", () => {
    const r = computeWikiNeighbors(edges, "papers/甲论文");
    expect(r.papers).toEqual([]);
    expect(r.others).toEqual([
      { id: "datasets/csmar", type: "datasets", label: "csmar", edgeType: "uses_dataset" },
      {
        id: "variables/代理成本",
        type: "variables",
        label: "代理成本",
        edgeType: "measures",
      },
    ]);
  });

  it("returns empty groups for an unknown or isolated node", () => {
    const r = computeWikiNeighbors(edges, "concepts/不存在");
    expect(r).toEqual({ papers: [], others: [] });
    expect(computeWikiNeighbors([], "papers/甲论文")).toEqual({ papers: [], others: [] });
  });
});

describe("file identity helpers", () => {
  it("recognises the wiki edges file at any root", () => {
    expect(isWikiEdgesFile("wiki/graph/edges.jsonl")).toBe(true);
    expect(isWikiEdgesFile("demo/wiki/graph/edges.jsonl")).toBe(true);
    expect(isWikiEdgesFile("wiki\\graph\\edges.jsonl")).toBe(true);
    expect(isWikiEdgesFile("graph/edges.jsonl")).toBe(true);
    expect(isWikiEdgesFile("edges.jsonl")).toBe(false);
    expect(isWikiEdgesFile("wiki/graph/citations.jsonl")).toBe(false);
  });

  it("derives the wiki root from the edges path", () => {
    expect(wikiRootFromEdgesPath("wiki/graph/edges.jsonl")).toBe("wiki");
    expect(wikiRootFromEdgesPath("a/b/wiki/graph/edges.jsonl")).toBe("a/b/wiki");
  });

  it("colors known types and falls back for unknown ones", () => {
    expect(wikiTypeColor("papers")).toBe("#1E2A3A");
    expect(wikiTypeColor("variables")).toBe("#C06A3E");
    expect(wikiTypeColor("nonesuch")).toBe("#8A8F98");
  });
});
