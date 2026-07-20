// Pure bibliography formatting for library items — mirrors what Zotero's CSL
// styles produce for the common item types (journal article / book / thesis):
//   "apa"     — APA 6th edition, alphabetical by author.
//   "gbt7714" — GB/T 7714-2015 顺序编码制 (numeric), input order, "[1] " prefixes.
// Anything else falls back to a sensible author–year–title line. Chinese names
// (CJK in the stored name) render family+given with no comma, per both styles.
import type { LibCreator, LibItem } from "./library";

export type CitationStyle = "apa" | "gbt7714";

const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff]/;
const isCjk = (s: string) => CJK_RE.test(s);

/** Authors only; falls back to all creators (editors etc.) when there are none. */
function authorsOf(item: LibItem): LibCreator[] {
  const authors = item.creators.filter((c) => c.kind === "author");
  return authors.length > 0 ? authors : item.creators;
}

/** "Title" -> "Title." but never "Title.." / "Title?." */
const endPunct = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** Bare DOI from whatever is stored ("10.x", "doi:10.x", "https://doi.org/10.x"). */
function bareDoi(item: LibItem): string {
  return (item.fields.DOI ?? "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
}

function field(item: LibItem, name: string): string {
  return (item.fields[name] ?? "").trim();
}

function isChineseItem(item: LibItem): boolean {
  const lang = field(item, "language").toLowerCase();
  if (lang.startsWith("zh") || lang.includes("chinese") || isCjk(lang)) return true;
  if (isCjk(item.title)) return true;
  const first = authorsOf(item)[0];
  return first ? isCjk(first.last + first.first) : false;
}

// ── APA 6th ─────────────────────────────────────────────────────────────────

/** "Smith, J. A." — or "张伟" (family+given, no comma) for CJK names. */
function apaName(c: LibCreator): string {
  if (isCjk(c.last) || isCjk(c.first)) return `${c.last}${c.first}`.trim();
  const initials = c.first
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .filter(Boolean)
        .map((p) => `${p[0].toUpperCase()}.`)
        .join("-"),
    )
    .join(" ");
  if (!c.last) return initials;
  return initials ? `${c.last}, ${initials}` : c.last;
}

/** APA 6th author list: "A., & B." up to 7; 8+ = first six, …, last. */
function apaAuthors(creators: LibCreator[]): string {
  const names = creators.map(apaName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 7)
    return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 6).join(", ")}, … ${names[names.length - 1]}`;
}

/** APA renders page ranges with an en dash: "77-101" -> "77–101". */
const enDashPages = (p: string) => p.trim().replace(/\s*[-‐‑–—]+\s*/g, "–");

function apaEntry(item: LibItem): string {
  const authors = apaAuthors(authorsOf(item));
  const year = item.year != null ? String(item.year) : "n.d.";
  let title = item.title.trim();
  if (item.itemType === "thesis") {
    title = `${title} (${field(item, "thesisType") || "Doctoral dissertation"})`;
  }
  const parts: string[] = [];
  if (authors) {
    parts.push(`${authors} (${year}).`);
    if (title) parts.push(endPunct(title));
  } else if (title) {
    // No creators: the title takes the author slot (Zotero does the same).
    parts.push(`${endPunct(title)} (${year}).`);
  } else {
    parts.push(`(${year}).`);
  }

  switch (item.itemType) {
    case "journalArticle":
    case "conferencePaper":
    case "preprint": {
      const journal = field(item, "publicationTitle") || field(item, "proceedingsTitle");
      const vol = field(item, "volume");
      const issue = field(item, "issue");
      const pages = enDashPages(field(item, "pages"));
      const volPart = vol ? `${vol}${issue ? `(${issue})` : ""}` : issue ? `(${issue})` : "";
      const src = [journal, volPart, pages].filter(Boolean).join(", ");
      if (src) parts.push(`${src}.`);
      break;
    }
    case "book":
    case "bookSection": {
      const place = field(item, "place");
      const publisher = field(item, "publisher");
      const src = place && publisher ? `${place}: ${publisher}` : place || publisher;
      if (src) parts.push(`${src}.`);
      break;
    }
    case "thesis": {
      const school = field(item, "university") || field(item, "publisher");
      if (school) parts.push(`${school}.`);
      break;
    }
    default: {
      const publisher = field(item, "publisher");
      if (publisher) parts.push(`${publisher}.`);
    }
  }

  const doi = bareDoi(item);
  if (doi) parts.push(`https://doi.org/${doi}`);
  return parts.join(" ");
}

/** APA reference lists sort by first author, then year, then title. */
function apaSortKey(item: LibItem): string {
  const first = authorsOf(item)[0];
  const name = first ? `${first.last} ${first.first}`.trim() : item.title;
  return `${name} ${item.year ?? 9999} ${item.title}`.toLowerCase();
}

// ── GB/T 7714-2015 顺序编码制 ────────────────────────────────────────────────

/** 文献类型标识 (GB/T 7714-2015 附录 B); unknown types fall back to [Z]. */
const GBT_TYPE_CODES: Record<string, string> = {
  journalArticle: "J",
  book: "M",
  bookSection: "M",
  thesis: "D",
  conferencePaper: "C",
  report: "R",
  newspaperArticle: "N",
  dataset: "DS",
  standard: "S",
  patent: "P",
  webpage: "EB/OL",
  preprint: "EB/OL",
};

/** "BRAUN V" (family caps, initials, no dots) — or "张伟" for CJK names. */
function gbtName(c: LibCreator): string {
  if (isCjk(c.last) || isCjk(c.first)) return `${c.last}${c.first}`.trim();
  const initials = c.first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .join(" ");
  return `${c.last.toUpperCase()}${initials ? ` ${initials}` : ""}`.trim();
}

/** Up to 3 authors, then ", 等" (Chinese items) / ", et al" — the trailing
 *  period comes from the group separator, giving "et al." in the output. */
function gbtAuthors(creators: LibCreator[], chinese: boolean): string {
  const names = creators.map(gbtName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")}, ${chinese ? "等" : "et al"}`;
}

function gbtEntry(item: LibItem): string {
  const authors = gbtAuthors(authorsOf(item), isChineseItem(item));
  const code = GBT_TYPE_CODES[item.itemType] ?? "Z";
  const year = item.year != null ? String(item.year) : "";
  const parts: string[] = [];
  if (authors) parts.push(`${authors}.`);
  parts.push(`${item.title.trim()}[${code}].`);

  switch (item.itemType) {
    case "journalArticle": {
      // 刊名, 年, 卷(期): 页码.  — no volume collapses to 年(期).
      const journal = field(item, "publicationTitle");
      const vol = field(item, "volume");
      const issue = field(item, "issue");
      const pages = field(item, "pages");
      let when = year;
      if (vol) when += `${when ? ", " : ""}${vol}${issue ? `(${issue})` : ""}`;
      else if (issue) when += `(${issue})`;
      let src = [journal, when].filter(Boolean).join(", ");
      if (pages) src += `${src ? ": " : ""}${pages}`;
      if (src) parts.push(`${src}.`);
      break;
    }
    case "thesis": {
      // 出版地: 学校, 年.
      const place = field(item, "place");
      const school = field(item, "university") || field(item, "publisher");
      const where = place && school ? `${place}: ${school}` : place || school;
      const src = [where, year].filter(Boolean).join(", ");
      if (src) parts.push(`${src}.`);
      break;
    }
    case "book":
    case "bookSection":
    default: {
      // 出版地: 出版社, 年.
      const place = field(item, "place");
      const publisher = field(item, "publisher");
      const where = place && publisher ? `${place}: ${publisher}` : place || publisher;
      const src = [where, year].filter(Boolean).join(", ");
      if (src) parts.push(`${src}.`);
    }
  }
  return parts.join(" ");
}

// ── Entry point ─────────────────────────────────────────────────────────────

/** One formatted reference per item. APA sorts alphabetically by author;
 *  GB/T keeps the input order and prefixes "[1] ", "[2] ", … */
export function formatBibliography(items: LibItem[], style: CitationStyle): string[] {
  if (style === "apa") {
    return items
      .map((i) => ({ key: apaSortKey(i), text: apaEntry(i) }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((e) => e.text);
  }
  return items.map((i, idx) => `[${idx + 1}] ${gbtEntry(i)}`);
}
