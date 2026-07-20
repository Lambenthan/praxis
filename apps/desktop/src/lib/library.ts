// Fishes's own literature library (Zotero-shaped, app-owned). Thin invoke
// wrappers over the Rust `library_*` commands plus the read-only local-Zotero
// bridge. Browser dev (no Tauri) gets nulls/empties so the page still renders.
import { isTauri } from "./tauri";

export interface LibCreator {
  first: string;
  last: string;
  /** Zotero creator type: author, editor, translator, … */
  kind: string;
}

export interface LibAttachment {
  key: string;
  title: string;
  contentType: string;
  /** Path relative to the library dir ("storage/KEY/file.pdf"); null when the
   *  attachment is a link we can't serve. */
  relPath: string | null;
}

export interface LibItem {
  key: string;
  itemType: string;
  title: string;
  creators: LibCreator[];
  year: number | null;
  tags: string[];
  /** Zotero field names -> values (title included). */
  fields: Record<string, string>;
  collectionIds: number[];
  attachments: LibAttachment[];
  dateAdded: string;
  dateModified: string;
  trashed: boolean;
}

export interface LibCollection {
  id: number;
  parentId: number | null;
  name: string;
}

export interface Library {
  dataDir: string;
  collections: LibCollection[];
  items: LibItem[];
}

export interface AddResult {
  added: LibItem[];
  errors: string[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function loadLibrary(): Promise<Library | null> {
  if (!isTauri) return null;
  return call<Library>("library_list");
}

/** Native multi-file picker; [] when cancelled. */
export async function pickPdfs(): Promise<string[]> {
  if (!isTauri) return [];
  return call<string[]>("library_pick_pdfs");
}

export async function addFiles(paths: string[]): Promise<AddResult> {
  return call<AddResult>("library_add_files", { paths });
}

export async function addDoi(doi: string): Promise<LibItem> {
  return call<LibItem>("library_add_doi", { doi });
}

export interface ItemPatch {
  itemType?: string;
  fields?: Record<string, string>;
  creators?: LibCreator[];
}

export async function updateItem(key: string, patch: ItemPatch): Promise<LibItem> {
  return call<LibItem>("library_update_item", { key, patch });
}

export async function setTags(key: string, tags: string[]): Promise<LibItem> {
  return call<LibItem>("library_set_tags", { key, tags });
}

export async function setTrashed(key: string, trashed: boolean): Promise<void> {
  return call<void>("library_set_trashed", { key, trashed });
}

export async function deleteItem(key: string): Promise<void> {
  return call<void>("library_delete_item", { key });
}

export async function createCollection(name: string, parentId?: number): Promise<number> {
  return call<number>("library_create_collection", { name, parentId: parentId ?? null });
}

export async function renameCollection(id: number, name: string): Promise<void> {
  return call<void>("library_rename_collection", { id, name });
}

export async function deleteCollection(id: number): Promise<void> {
  return call<void>("library_delete_collection", { id });
}

export async function assignCollection(
  key: string,
  collectionId: number,
  member: boolean,
): Promise<void> {
  return call<void>("library_assign_collection", { key, collectionId, member });
}

export async function importZotero(): Promise<ImportResult> {
  return call<ImportResult>("library_import_zotero");
}

export interface StageResult {
  pdfPath: string;
  metaPath: string;
}

/** Copy an item's PDF + metadata sidecar into the active workspace's
 *  raw/papers/ for empirical-wiki ingestion. */
export async function stageForWiki(key: string): Promise<StageResult> {
  return call<StageResult>("library_stage_for_wiki", { key });
}

export interface StageManyResult {
  staged: StageResult[];
  /** Titles that could not be staged (no stored PDF / missing file). */
  skipped: string[];
}

/** Batch staging for a collection / the whole library. */
export async function stageManyForWiki(keys: string[]): Promise<StageManyResult> {
  return call<StageManyResult>("library_stage_for_wiki_many", { keys });
}

export interface Annotation {
  id: number;
  attachmentKey: string;
  page: number;
  kind: string;
  color: string;
  /** JSON "[[x1,y1,x2,y2],…]" in page coordinates at scale 1. */
  rects: string;
  quoted: string;
  comment: string;
  dateAdded: string;
  dateModified: string;
}

export async function listAnnotations(attachmentKey: string): Promise<Annotation[]> {
  return call<Annotation[]>("annotation_list", { attachmentKey });
}

export async function addAnnotation(
  attachmentKey: string,
  page: number,
  color: string,
  rects: number[][],
  quoted: string,
): Promise<Annotation> {
  return call<Annotation>("annotation_add", {
    attachmentKey,
    page,
    color,
    rects: JSON.stringify(rects),
    quoted,
  });
}

export async function updateAnnotation(
  id: number,
  patch: { color?: string; comment?: string },
): Promise<Annotation> {
  return call<Annotation>("annotation_update", { id, ...patch });
}

export async function deleteAnnotation(id: number): Promise<void> {
  return call<void>("annotation_delete", { id });
}

/** The Zotero highlight palette (yellow/green/blue/pink). */
export const HIGHLIGHT_COLORS = ["#ffd400", "#5fb236", "#2ea8e5", "#ff6666"] as const;

/** Whether a local Zotero install looks importable (used to show the action). */
export async function zoteroAvailable(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    await call<unknown>("zotero_library");
    return true;
  } catch {
    return false;
  }
}

/** "Smith" / "Smith & Lee" / "Smith et al." — the item-table creator column. */
export function creatorsLabel(item: LibItem): string {
  const names = item.creators.map((c) => c.last || c.first).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} et al.`;
}

/** Common Zotero item types offered in the editor (any other value round-trips). */
export const ITEM_TYPES = [
  "journalArticle",
  "conferencePaper",
  "preprint",
  "book",
  "bookSection",
  "thesis",
  "report",
  "dataset",
  "webpage",
  "document",
] as const;

/** Fields shown (in order) in the editor even when empty; other stored fields
 *  are appended after these. */
export const EDITOR_FIELDS = [
  "publicationTitle",
  "date",
  "volume",
  "issue",
  "pages",
  "publisher",
  "DOI",
  "url",
  "language",
  "abstractNote",
] as const;

/** Internal bookkeeping fields never shown as editable metadata. */
export const HIDDEN_FIELDS = new Set(["title", "zoteroKey", "wikiStaged"]);
