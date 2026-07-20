// The literature wiki's knowledge graph (.wiki/graph/edges.jsonl) parsed and
// laid out for the graph inspector. Pure and deterministic — the layout runs a
// fixed number of force iterations from hash-seeded positions, so the same
// file always renders the same picture and tests can assert on coordinates.

export interface WikiEdge {
  from: string;
  to: string;
  type: string;
  confidence?: string;
  evidence?: string;
  symmetric?: boolean;
  date?: string;
}

export interface WikiNode {
  /** Full id, e.g. "papers/qiu-2024-tfp" — also the card path minus ".md". */
  id: string;
  /** Entity directory, e.g. "papers", "variables". */
  type: string;
  /** The slug shown as the node label. */
  label: string;
  /** Number of incident edges — drives node radius. */
  degree: number;
}

/** Parse edges.jsonl. Malformed lines are skipped, never fatal — the graph is
 *  machine-written but must survive a hand-edited or truncated file. */
export function parseWikiEdges(text: string): WikiEdge[] {
  const edges: WikiEdge[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try {
      const e = JSON.parse(s) as WikiEdge;
      if (typeof e.from === "string" && typeof e.to === "string" && typeof e.type === "string")
        edges.push(e);
    } catch {
      // skip malformed line
    }
  }
  return edges;
}

/** Collect the node set from edge endpoints. */
export function buildNodes(edges: WikiEdge[]): WikiNode[] {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  return [...degree.entries()].map(([id, d]) => {
    const slash = id.indexOf("/");
    return {
      id,
      type: slash > 0 ? id.slice(0, slash) : "other",
      label: slash > 0 ? id.slice(slash + 1) : id,
      degree: d,
    };
  });
}

/** A wiki card's content, keyed by its id ("dir/slug", the path minus ".md"). */
export interface WikiCardSource {
  id: string;
  text: string;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Build the one wikilink resolver every consumer shares (edge derivation and
 * the card reader's clickable [[links]]). Targets may be "dir/slug" or a bare
 * "slug", matched case-insensitively against the card id set; "target|alias",
 * "target#heading" and a trailing ".md" are stripped first. An ambiguous bare
 * slug resolves to the lexicographically first match, deterministically.
 * Returns the canonical card id, or null when no card matches.
 */
export function buildWikilinkResolver(
  cardIds: Iterable<string>,
): (target: string) => string | null {
  const byId = new Map<string, string>(); // lowercased full id -> id
  const bySlug = new Map<string, string[]>(); // lowercased slug -> ids (sorted)
  for (const id of [...cardIds].sort((a, b) => a.localeCompare(b))) {
    byId.set(id.toLowerCase(), id);
    const slug = id.slice(id.indexOf("/") + 1).toLowerCase();
    const list = bySlug.get(slug);
    if (list) list.push(id);
    else bySlug.set(slug, [id]);
  }
  return (target: string): string | null => {
    const raw = target.split("|")[0].split("#")[0].trim().replace(/\.md$/i, "");
    if (!raw) return null;
    const key = raw.toLowerCase();
    return (key.includes("/") ? byId.get(key) : bySlug.get(key)?.[0]) ?? null;
  };
}

/**
 * Fallback graph: derive edges from the cards' Obsidian-style [[wikilinks]]
 * when the wiki has no generated graph/edges.jsonl (e.g. an interrupted ingest
 * run). Resolution rules are `buildWikilinkResolver`'s. Self-links and
 * duplicate (from, to) pairs are dropped; links to cards that don't exist are
 * ignored.
 */
export function deriveEdgesFromCards(cards: WikiCardSource[]): WikiEdge[] {
  const resolve = buildWikilinkResolver(cards.map((c) => c.id));
  const edges: WikiEdge[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    for (const m of card.text.matchAll(WIKILINK_RE)) {
      const to = resolve(m[1]);
      if (!to || to === card.id) continue;
      const key = `${card.id}\u0000${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: card.id, to, type: "links_to" });
    }
  }
  return edges;
}

/** Union of two edge lists, deduped by (from, to) — the first list wins, so
 *  the generated graph's typed edge beats a derived generic "links_to". */
export function mergeWikiEdges(primary: WikiEdge[], secondary: WikiEdge[]): WikiEdge[] {
  const out: WikiEdge[] = [];
  const seen = new Set<string>();
  for (const e of [...primary, ...secondary]) {
    const key = `${e.from}::${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** A card adjacent to the selected one, plus the connecting edge's type. */
export interface WikiNeighbor {
  id: string;
  type: string;
  label: string;
  edgeType: string;
}

/** The selected card's neighborhood, grouped for the reading pane: the papers
 *  it comes from first, every other entity type after. */
export interface WikiRelated {
  papers: WikiNeighbor[];
  others: WikiNeighbor[];
}

/**
 * Collect a card's neighbors from the edge list, both directions, deduped by
 * neighbor id (the first edge met names the relation). Grouped papers-first
 * and sorted (papers by label; others by type, then label) so the list reads
 * the same regardless of edge order.
 */
export function computeWikiNeighbors(edges: WikiEdge[], id: string): WikiRelated {
  const byId = new Map<string, WikiNeighbor>();
  for (const e of edges) {
    const other = e.from === id ? e.to : e.to === id ? e.from : null;
    if (!other || other === id || byId.has(other)) continue;
    const slash = other.indexOf("/");
    byId.set(other, {
      id: other,
      type: slash > 0 ? other.slice(0, slash) : "other",
      label: slash > 0 ? other.slice(slash + 1) : other,
      edgeType: e.type,
    });
  }
  const all = [...byId.values()];
  return {
    papers: all.filter((n) => n.type === "papers").sort((a, b) => a.label.localeCompare(b.label)),
    others: all
      .filter((n) => n.type !== "papers")
      .sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label)),
  };
}

/** Entity-type palette — ink for papers, terracotta for variables, the rest
 *  are restrained mid-tones consistent with the app's document styling. */
export const WIKI_TYPE_COLORS: Record<string, string> = {
  papers: "#1E2A3A",
  variables: "#C06A3E",
  datasets: "#5B7553",
  models: "#4A6B8A",
  mechanisms: "#8A5A44",
  hypotheses: "#B08968",
  identification: "#355070",
  robustness: "#94A187",
  heterogeneity: "#C2A878",
  assumptions: "#6D597A",
  propositions: "#7A5980",
  concepts: "#B56576",
  claims: "#A26769",
  topics: "#6E7F80",
  people: "#847577",
  foundations: "#9A8C98",
};

export function wikiTypeColor(type: string): string {
  return WIKI_TYPE_COLORS[type] ?? "#8A8F98";
}

/** The wiki root, given the path of its graph/edges.jsonl. */
export function wikiRootFromEdgesPath(path: string): string {
  return path.replace(/[\\/]graph[\\/]edges\.jsonl$/i, "");
}

/** Is this file the wiki knowledge graph? (basename match, any wiki root) */
export function isWikiEdgesFile(path: string): boolean {
  return /(^|[\\/])graph[\\/]edges\.jsonl$/i.test(path);
}
