import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2, Network, Plus, Trash2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  deleteItem,
  EDITOR_FIELDS,
  HIDDEN_FIELDS,
  ITEM_TYPES,
  setTags,
  setTrashed,
  updateItem,
  type LibCreator,
  type LibItem,
} from "@/lib/library";
import { stageAndGenerate } from "./generateWiki";
import { ResizeEdge, useStoredWidth } from "./ResizeEdge";

/**
 * The right-hand metadata editor (Zotero's Info pane): item type, title,
 * creators, fields, tags, attachments. Every edit commits on blur/change and
 * hands the updated item back up.
 */
export function DetailPane({
  item,
  ingested,
  inTrash,
  onChanged,
  onReload,
  onDeselect,
  onOpenPdf,
  onOpenChat,
  onGenerateStarted,
}: {
  item: LibItem;
  /** This paper already has a card in the project wiki — generating again is
   *  an explicit re-ingest, and the button says so. */
  ingested?: boolean;
  inTrash: boolean;
  onChanged: (item: LibItem) => void;
  onReload: () => void;
  onDeselect: () => void;
  onOpenPdf: (key: string, relPath: string, name: string) => void;
  /** Open the library's docked conversation; without it, ingestion falls back
   *  to navigating to the full session view. */
  onOpenChat?: () => void;
  /** Notifies the page a wiki generation was dispatched (jump-on-finish). */
  onGenerateStarted?: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [tagDraft, setTagDraft] = useState("");
  const [staging, setStaging] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasPdf = item.attachments.some((a) => a.contentType === "application/pdf" && a.relPath);

  /** One-click wiki generation (the Obsidian-plugin interaction): stage +
   *  run immediately via the shared flow; progress streams into the docked
   *  conversation (or /live), where follow-up questions go too. */
  const ingestIntoWiki = async () => {
    setStaging(true);
    setStageError(null);
    try {
      // Ingests into the open project's one wiki (`<workspace>/wiki`) — no
      // per-collection wiki folder, no workspace switch.
      await stageAndGenerate([item.key], t, () => {
        if (onOpenChat) onOpenChat();
        else navigate("/live");
      });
      onGenerateStarted?.();
    } catch (e) {
      setStageError(String(e));
    }
    setStaging(false);
  };

  const commitFields = async (patch: Record<string, string>) => {
    const fields = { ...item.fields, ...patch };
    onChanged(await updateItem(item.key, { fields }));
  };

  const commitCreators = async (creators: LibCreator[]) => {
    onChanged(await updateItem(item.key, { creators }));
  };

  const fieldOrder: string[] = [
    ...EDITOR_FIELDS,
    ...Object.keys(item.fields).filter(
      (f) => !HIDDEN_FIELDS.has(f) && !(EDITOR_FIELDS as readonly string[]).includes(f),
    ),
  ];

  const [width, setWidth] = useStoredWidth("fishes.lib.detail.w", 330, 260, 560);
  return (
    <div
      className="relative flex shrink-0 flex-col overflow-y-auto border-l border-border bg-surface"
      style={{ width }}
    >
      <ResizeEdge edge="left" width={width} onResize={setWidth} />
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">
          {item.title}
        </span>
        <button className="text-text hover:opacity-60" aria-label={t("Close")} onClick={onDeselect}>
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3">
        {/* Empirical wiki bridge — the pane's primary action, first thing seen. */}
        {!inTrash && (
          <div>
            <button
              disabled={!hasPdf || staging}
              onClick={() => void ingestIntoWiki()}
              title={
                hasPdf
                  ? t("Stages the PDF + metadata and starts generating the wiki in the conversation")
                  : t("This item has no stored PDF attachment")
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-input bg-accent px-2 py-1.5 text-[14px] font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {staging ? <Loader2 size={13} className="animate-spin" /> : <Network size={13} />}
              {ingested ? t("Re-generate wiki") : t("Generate wiki")}
            </button>
            {item.fields.wikiStaged && (
              <div className="mt-1 text-[11px] text-muted">
                {t("Sent for ingestion (workspace {w}).").replace("{w}", item.fields.wikiStaged)}
              </div>
            )}
            {stageError && <div className="mt-1 text-[11px] text-red-600">{stageError}</div>}
          </div>
        )}

        {/* Type + title */}
        <Row label={t("Item type")}>
          <select
            value={item.itemType}
            onChange={(e) => void updateItem(item.key, { itemType: e.target.value }).then(onChanged)}
            className="w-full rounded-input border border-border bg-surface px-1.5 py-1 text-[14px] text-text outline-none"
          >
            {(ITEM_TYPES as readonly string[]).includes(item.itemType) ? null : (
              <option value={item.itemType}>{item.itemType}</option>
            )}
            {ITEM_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(TYPE_LABELS[ty] ?? ty)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t("Title")}>
          <AutoTextarea
            defaultValue={item.title === "(untitled)" ? "" : item.title}
            onCommit={(v) => void commitFields({ title: v })}
          />
        </Row>

        {/* Creators */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              {t("Creators")}
            </span>
            <button
              className="text-muted hover:text-text"
              aria-label={t("Add creator")}
              onClick={() =>
                void commitCreators([...item.creators, { first: "", last: "", kind: "author" }])
              }
            >
              <Plus size={12} />
            </button>
          </div>
          {item.creators.length === 0 && (
            <div className="text-[12px] text-muted">{t("No creators.")}</div>
          )}
          {item.creators.map((c, idx) => (
            <div key={idx} className="mb-1 flex items-center gap-1">
              <input
                defaultValue={c.first}
                placeholder={t("First")}
                onBlur={(e) => {
                  if (e.target.value === c.first) return;
                  const next = [...item.creators];
                  next[idx] = { ...c, first: e.target.value };
                  void commitCreators(next);
                }}
                className="w-0 flex-1 rounded-input border border-border bg-surface px-1.5 py-0.5 text-[13px] text-text outline-none placeholder:text-muted"
              />
              <input
                defaultValue={c.last}
                placeholder={t("Last")}
                onBlur={(e) => {
                  if (e.target.value === c.last) return;
                  const next = [...item.creators];
                  next[idx] = { ...c, last: e.target.value };
                  void commitCreators(next);
                }}
                className="w-0 flex-1 rounded-input border border-border bg-surface px-1.5 py-0.5 text-[13px] text-text outline-none placeholder:text-muted"
              />
              <button
                className="shrink-0 text-muted hover:text-text"
                aria-label={t("Remove creator")}
                onClick={() => void commitCreators(item.creators.filter((_, i) => i !== idx))}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Fields */}
        {fieldOrder.map((f) => (
          <Row key={f} label={t(FIELD_LABELS[f] ?? f)}>
            {f === "abstractNote" ? (
              <AutoTextarea
                defaultValue={item.fields[f] ?? ""}
                onCommit={(v) => void commitFields({ [f]: v })}
              />
            ) : (
              <input
                defaultValue={item.fields[f] ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (item.fields[f] ?? "")) {
                    void commitFields({ [f]: e.target.value });
                  }
                }}
                className="w-full rounded-input border border-border bg-surface px-1.5 py-1 text-[14px] text-text outline-none"
              />
            )}
          </Row>
        ))}

        {/* Tags */}
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
            {t("Tags")}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-input bg-surface-2 px-1.5 py-0.5 text-[12px] text-text"
              >
                {tag}
                <button
                  className="text-muted hover:text-text"
                  aria-label={t("Remove tag")}
                  onClick={() => void setTags(item.key, item.tags.filter((x) => x !== tag)).then(onChanged)}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagDraft.trim()) {
                  void setTags(item.key, [...item.tags, tagDraft.trim()]).then(onChanged);
                  setTagDraft("");
                }
              }}
              placeholder={t("Add tag")}
              className="w-20 rounded-input border border-border bg-surface px-1.5 py-0.5 text-[12px] text-text outline-none placeholder:text-muted"
            />
          </div>
        </div>

        {/* Attachments */}
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
            {t("Attachments")}
          </div>
          {item.attachments.length === 0 && (
            <div className="text-[12px] text-muted">{t("No attachments.")}</div>
          )}
          {item.attachments.map((a) => (
            <button
              key={a.key}
              disabled={!a.relPath}
              onClick={() => a.relPath && onOpenPdf(a.key, a.relPath, a.title)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[13px]",
                a.relPath ? "text-text hover:bg-surface-2" : "text-muted",
              )}
            >
              <FileText size={13} className="shrink-0 text-muted" />
              <span className="truncate">{a.title}</span>
            </button>
          ))}
        </div>

        {/* Trash / restore / delete */}
        <div className="mt-2 border-t border-border pt-2">
          {inTrash ? (
            <div className="flex items-center gap-2">
              <FooterBtn
                onClick={async () => {
                  await setTrashed(item.key, false);
                  onDeselect();
                  onReload();
                }}
              >
                <Undo2 size={12} /> {t("Restore")}
              </FooterBtn>
              {/* In-app ConfirmDialog — window.confirm is a no-op in the
                  desktop webview (Tauri wires no native panel). */}
              <FooterBtn danger onClick={() => setConfirmDelete(true)}>
                <Trash2 size={12} /> {t("Delete permanently")}
              </FooterBtn>
            </div>
          ) : (
            <FooterBtn
              onClick={async () => {
                await setTrashed(item.key, true);
                onDeselect();
                onReload();
              }}
            >
              <Trash2 size={12} /> {t("Move to trash")}
            </FooterBtn>
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={t("Delete permanently")}
          body={t("Delete this item and its files permanently?")}
          confirmLabel={t("Delete")}
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteItem(item.key).then(() => {
              onDeselect();
              onReload();
            });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{label}</div>
      {children}
    </div>
  );
}

/** Commit-on-blur textarea that grows with its content. */
function AutoTextarea({
  defaultValue,
  onCommit,
}: {
  defaultValue: string;
  onCommit: (v: string) => void;
}) {
  return (
    <textarea
      defaultValue={defaultValue}
      rows={Math.min(8, Math.max(1, Math.ceil(defaultValue.length / 40)))}
      onBlur={(e) => {
        if (e.target.value !== defaultValue) onCommit(e.target.value);
      }}
      className="w-full resize-y rounded-input border border-border bg-surface px-1.5 py-1 text-[14px] leading-relaxed text-text outline-none"
    />
  );
}

function FooterBtn({
  danger,
  onClick,
  children,
}: {
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-input border border-border px-2 py-1 text-[13px]",
        danger ? "text-red-600 hover:bg-red-500/10" : "text-text hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

const TYPE_LABELS: Record<string, string> = {
  journalArticle: "Journal article",
  conferencePaper: "Conference paper",
  preprint: "Preprint",
  book: "Book",
  bookSection: "Book section",
  thesis: "Thesis",
  report: "Report",
  dataset: "Dataset",
  webpage: "Web page",
  document: "Document",
};

const FIELD_LABELS: Record<string, string> = {
  publicationTitle: "Publication",
  date: "Date",
  volume: "Volume",
  issue: "Issue",
  pages: "Pages",
  publisher: "Publisher",
  DOI: "DOI",
  url: "URL",
  language: "Language",
  abstractNote: "Abstract",
};
