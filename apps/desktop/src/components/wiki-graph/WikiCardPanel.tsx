import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import type { FileRoot } from "@fishes/shared";
import { readArtifact } from "@/lib/artifactFile";
import { wikiTypeColor, type WikiNeighbor, type WikiNode, type WikiRelated } from "@/lib/wikiGraph";
import { MarkdownViewer } from "@/components/markdown-viewer/MarkdownViewer";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/** Entity dirs to probe when resolving a bare [[wikilink]] slug to a card. */
const ENTITY_DIRS = [
  "papers",
  "variables",
  "datasets",
  "models",
  "mechanisms",
  "hypotheses",
  "identification",
  "robustness",
  "heterogeneity",
  "assumptions",
  "propositions",
  "concepts",
  "claims",
  "topics",
  "people",
  "foundations",
  "tables",
  "ideas",
  "experiments",
  "Summary",
];

/**
 * A wiki card rendered beside the graph, reading like Obsidian's preview:
 * the product's card typography, frontmatter hidden, and `[[wikilinks]]` clickable —
 * following one swaps the panel to that card (with a back stack).
 */
export function WikiCardPanel({
  node,
  wikiRoot,
  root,
  onClose,
  className,
  related,
  onOpen,
  resolveLink,
}: {
  node: WikiNode;
  wikiRoot: string;
  root?: FileRoot;
  onClose: () => void;
  className?: string;
  /** The shown card's neighborhood (papers first), rendered below the body.
   *  The caller computes it for `node` — pair it with `onOpen` so navigation
   *  goes through the caller and the two never drift apart. */
  related?: WikiRelated | null;
  /** When set, following a wikilink or a related row hands navigation to the
   *  caller (which re-renders the panel with a new `node`) instead of the
   *  panel's internal back-stack. */
  onOpen?: (card: { id: string; type: string; label: string }) => void;
  /** Resolves a raw [[wikilink]] target to a card id (null = no such card).
   *  With it, unresolvable links render as plain text and clicks skip the
   *  directory probing; without it, the legacy probe-every-dir path runs. */
  resolveLink?: (target: string) => string | null;
}) {
  const t = useT();
  // The panel navigates internally: current = what's shown, stack = history.
  const [current, setCurrent] = useState<{ id: string; label: string; type: string }>(node);
  const [stack, setStack] = useState<{ id: string; label: string; type: string }[]>([]);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(node);
    setStack([]);
  }, [node]);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    readArtifact(`${wikiRoot}/${current.id}.md`, root)
      .then((f) => {
        if (cancelled) return;
        if (f && f.encoding === "utf8")
          setText(linkifyWikilinks(stripFrontmatter(f.data), resolveLink));
        else setError(t("This card could not be read."));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // `t` deliberately excluded: only [current, wikiRoot, root, resolveLink]
    // define WHAT to load/render — a changing translator identity must never
    // reload (and reset the scroll of) the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, wikiRoot, root, resolveLink]);

  /** Open a card whose id is already known (resolved wikilink / related row). */
  const openCard = (id: string, label?: string) => {
    const slash = id.indexOf("/");
    const card = {
      id,
      type: slash > 0 ? id.slice(0, slash) : "other",
      label: label ?? (slash > 0 ? id.slice(slash + 1) : id),
    };
    if (onOpen) {
      onOpen(card);
      return;
    }
    setStack((s) => [...s, current]);
    setCurrent(card);
  };

  const followWikilink = async (slug: string) => {
    // A slug may live in any entity dir — probe until the card exists.
    for (const dir of ENTITY_DIRS) {
      try {
        const f = await readArtifact(`${wikiRoot}/${dir}/${slug}.md`, root);
        if (f && f.encoding === "utf8") {
          openCard(`${dir}/${slug}`, slug);
          return;
        }
      } catch {
        /* keep probing */
      }
    }
  };

  const goBack = () => {
    const prev = stack[stack.length - 1];
    if (!prev) return;
    setStack((s) => s.slice(0, -1));
    setCurrent(prev);
  };

  return (
    <div
      className={cn(
        "flex w-[46%] min-w-[300px] max-w-[560px] flex-col border-l border-border bg-surface",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        {stack.length > 0 && (
          <button className="text-text hover:opacity-60" aria-label={t("Back")} onClick={goBack}>
            <ArrowLeft size={13} strokeWidth={1.5} />
          </button>
        )}
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: wikiTypeColor(current.type) }}
        />
        <span className="truncate text-[13px] font-medium text-text">{current.label}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
          {current.type}
        </span>
        <div className="flex-1" />
        <button className="text-text hover:opacity-60" aria-label={t("Close card")} onClick={onClose}>
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto px-4 py-3"
        onClick={(ev) => {
          const a = (ev.target as HTMLElement).closest("a");
          const href = a?.getAttribute("href") ?? "";
          if (href.startsWith("#wikicard=")) {
            // Pre-resolved by `resolveLink` at render time — open directly.
            ev.preventDefault();
            openCard(decodeURIComponent(href.slice("#wikicard=".length)));
          } else if (href.startsWith("#wikilink=")) {
            ev.preventDefault();
            void followWikilink(decodeURIComponent(href.slice("#wikilink=".length)));
          }
        }}
      >
        {text === null && !error && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> {t("Loading…")}
          </div>
        )}
        {error && <div className="text-sm text-error">{error}</div>}
        {text !== null && <MarkdownViewer variant="card">{text}</MarkdownViewer>}
        {/* The card's neighborhood — its source papers first. Rendered only
            when there is something to show: no empty shell (spec). */}
        {text !== null && related && (related.papers.length > 0 || related.others.length > 0) && (
          <div className="mt-6 border-t border-border pt-3">
            {related.papers.length > 0 && (
              <RelatedGroup
                title={t("Related papers")}
                items={related.papers}
                onPick={(n) => openCard(n.id, n.label)}
              />
            )}
            {related.others.length > 0 && (
              <RelatedGroup
                title={t("Related cards")}
                items={related.others}
                onPick={(n) => openCard(n.id, n.label)}
                className={related.papers.length > 0 ? "mt-3" : undefined}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One neighbor group — a quiet heading over quiet rows (dot + label). */
function RelatedGroup({
  title,
  items,
  onPick,
  className,
}: {
  title: string;
  items: WikiNeighbor[];
  onPick: (n: WikiNeighbor) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[12px] font-medium text-muted">
        {title} ({items.length})
      </div>
      {items.map((n) => (
        <button
          key={n.id}
          onClick={() => onPick(n)}
          className="mt-0.5 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[13px] text-text hover:bg-surface-2"
        >
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: wikiTypeColor(n.type) }}
          />
          <span className="truncate">{n.label}</span>
          <span className="ml-auto shrink-0 text-[10px] text-muted">{n.edgeType}</span>
        </button>
      ))}
    </div>
  );
}

/** Cards carry YAML frontmatter meant for the graph tools, not the reader. */
function stripFrontmatter(md: string): string {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return m ? md.slice(m[0].length) : md;
}

/**
 * `[[slug]]` → a markdown link the panel's click handler intercepts. With a
 * resolver, targets are resolved to card ids up front (`#wikicard=<id>`) and
 * links that resolve to no card stay plain text — never a dead link. Without
 * one, every wikilink becomes a `#wikilink=` probe (legacy path).
 */
function linkifyWikilinks(md: string, resolve?: (target: string) => string | null): string {
  return md.replace(
    /\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/g,
    (_all, slug: string, alias?: string) => {
      const label = alias ?? slug;
      if (!resolve) return `[${label}](#wikilink=${encodeURIComponent(slug.trim())})`;
      const id = resolve(slug);
      return id ? `[${label}](#wikicard=${encodeURIComponent(id)})` : label;
    },
  );
}
