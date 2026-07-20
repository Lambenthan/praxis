// Which papers are already in the project wiki? Ground truth is the card
// files at <workspace>/wiki/papers/*.md: each has YAML frontmatter with a
// clean `title:` and a filename slug that often carries the same `_作者`
// suffix as the library item title. The library uses this to badge ingested
// rows and to keep "Generate wiki" from re-ingesting the same paper.
import { listDir, readArtifact } from "@/lib/artifactFile";

/** Lowercase and strip everything that is not a letter (CJK included) or a
 *  digit, so punctuation/underscore/dash/space variants of one title compare
 *  equal ("耐心资本与企业全要素生产率提升_邱蓉" ↔ "耐心资本与企业全要素生产率提升-邱蓉"). */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** The `title:` value of the first YAML frontmatter block, or null. A simple
 *  line regex on purpose — the ingest skill always writes `title: "..."` on
 *  one line, so a YAML dependency would be dead weight. */
export function extractFrontmatterTitle(md: string): string | null {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(md);
  if (!fm) return null;
  const line = /^title:\s*(.+?)\s*$/m.exec(fm[1]);
  if (!line) return null;
  const raw = line[1].trim();
  const unquoted = /^(["'])(.*)\1$/.exec(raw);
  return (unquoted ? unquoted[2] : raw).trim() || null;
}

/**
 * Normalized identities of every paper already in the wiki: for each
 * wiki/papers/*.md card, its frontmatter title AND its filename slug (the
 * slug keeps the `_作者` suffix that library titles carry, so a card whose
 * clean title diverges — e.g. a "——subtitle" the slug drops — still matches).
 * Missing dir / unreadable cards degrade to an empty or partial set.
 */
export async function loadIngestedTitles(): Promise<Set<string>> {
  const out = new Set<string>();
  let entries: Awaited<ReturnType<typeof listDir>> = [];
  try {
    entries = await listDir("wiki/papers", "workspace");
  } catch {
    return out; // no wiki yet
  }
  const cards = entries.filter((e) => !e.isDir && e.name.endsWith(".md"));
  await Promise.all(
    cards.map(async (e) => {
      const slug = normalizeTitle(e.name.replace(/\.md$/, ""));
      if (slug) out.add(slug);
      try {
        const f = await readArtifact(`wiki/papers/${e.name}`, "workspace");
        if (f && f.encoding === "utf8") {
          const title = extractFrontmatterTitle(f.data);
          const n = title ? normalizeTitle(title) : "";
          if (n) out.add(n);
        }
      } catch {
        /* unreadable card — the filename slug already covers it */
      }
    }),
  );
  return out;
}

/** Prefix matches shorter than this (normalized chars) are ignored — "耐心资本"
 *  must not claim every paper in a patient-capital library. */
const MIN_PREFIX_LEN = 6;

/**
 * Is this library item already in the wiki? Equal after normalization, or one
 * side a prefix of the other — which absorbs the `_作者` suffix on library
 * titles ("耐心资本与企业全要素生产率提升_邱蓉" vs wiki title
 * "耐心资本与企业全要素生产率提升") and filename slugs, both ways round.
 */
export function isIngested(itemTitle: string, ingested: Set<string>): boolean {
  const n = normalizeTitle(itemTitle);
  if (!n) return false;
  if (ingested.has(n)) return true;
  for (const s of ingested) {
    const shorter = Math.min(s.length, n.length);
    if (shorter < MIN_PREFIX_LEN) continue;
    if (s.startsWith(n) || n.startsWith(s)) return true;
  }
  return false;
}
