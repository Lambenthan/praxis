import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Minus, PanelRight, Plus, Trash2, X } from "lucide-react";
import { readArtifact } from "@/lib/artifactFile";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import {
  addAnnotation,
  deleteAnnotation,
  HIGHLIGHT_COLORS,
  listAnnotations,
  updateAnnotation,
  type Annotation,
} from "@/lib/library";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { ResizeEdge, useStoredWidth } from "./ResizeEdge";

/** pdf.js loaded lazily (inside effects) so jsdom tests and the initial
 *  bundle never touch it; the module is cached after the first open. */
type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([m, worker]) => {
    m.GlobalWorkerOptions.workerSrc = worker.default;
    return m;
  });
  return pdfjsPromise;
}

interface SelectionDraft {
  page: number;
  /** Page coordinates at scale 1. */
  rects: number[][];
  quoted: string;
  /** Toolbar anchor, relative to the reader root. */
  x: number;
  y: number;
}

interface PopoverState {
  id: number;
  x: number;
  y: number;
}

/** Display-only mode: the user wants the reader to JUST show the PDF — the
 *  Zotero-style highlight/annotation layer is finished but switched off
 *  rather than deleted, so it can return as a setting later. */
const ANNOTATE = false;

/**
 * Fishes's own PDF reader for library attachments: pdf.js canvas + text layer,
 * select-to-highlight (Zotero's four colors), per-highlight comments, and an
 * annotation sidebar. Annotations persist in library.sqlite keyed by the
 * attachment. Clean-room implementation — behavior referenced from Zotero's
 * reader, no code shared.
 */
export function PdfReader({
  attachmentKey,
  relPath,
  name,
  onClose,
}: {
  attachmentKey: string;
  relPath: string;
  name: string;
  onClose: () => void;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const [pdfjs, setPdfjs] = useState<PdfjsModule | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const scale = fitScale * (zoom / 100);

  // Load the document (via the Rust file read — the preview server is
  // deliberately CORS-less, so pdf.js can't fetch from it) + its annotations.
  useEffect(() => {
    let cancelled = false;
    // Cleanup goes through the loading task — it tears down the doc AND the
    // worker channel (PDFDocumentProxy itself exposes no destroy in v6 types).
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        // The library lives at <workspace>/literature (library.rs::library_dir);
        // the "workspace" scope resolves to the same folder, including its
        // no-project fallback to the base dir (runtime.rs::workspace_dir).
        const [m, file, anns] = await Promise.all([
          loadPdfjs(),
          readArtifact(`literature/${relPath}`, "workspace"),
          listAnnotations(attachmentKey),
        ]);
        if (cancelled) return;
        if (!file || file.encoding !== "base64") throw new Error("file unavailable");
        const raw = atob(file.data);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const loading = m.getDocument({ data: bytes });
        task = loading;
        const d = await loading.promise;
        if (cancelled) return;
        // Default zoom = fit the page width to the viewer.
        const page1 = await d.getPage(1);
        const vw = page1.getViewport({ scale: 1 });
        const avail = (scrollRef.current?.clientWidth ?? 720) - 32;
        setFitScale(Math.min(2.5, Math.max(0.4, avail / vw.width)));
        setPdfjs(m);
        setDoc(d);
        setAnnotations(anns);
      } catch (e) {
        if (!cancelled) setFailed(String(e));
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [attachmentKey, relPath]);

  /** Selection → highlight draft (page coords, merged per text line). */
  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!ANNOTATE) return; // display-only reader (user choice) — no highlight UI
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setDraft(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const start =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement;
      const pageEl = start?.closest<HTMLElement>("[data-pdf-page]");
      if (!pageEl) {
        setDraft(null);
        return;
      }
      const pageNum = Number(pageEl.dataset.pdfPage);
      const p = pageEl.getBoundingClientRect();
      const rects: number[][] = [];
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1 || r.height < 1 || r.height > 80) continue;
        // Only fragments on the starting page (multi-page selections clip).
        if (r.bottom < p.top || r.top > p.bottom) continue;
        rects.push([
          (r.left - p.left) / scale,
          (r.top - p.top) / scale,
          (r.right - p.left) / scale,
          (r.bottom - p.top) / scale,
        ]);
        if (rects.length >= 300) break;
      }
      if (rects.length === 0) {
        setDraft(null);
        return;
      }
      const root = rootRef.current!.getBoundingClientRect();
      setPopover(null);
      setDraft({
        page: pageNum,
        rects: mergeLineRects(rects),
        quoted: sel.toString().slice(0, 1000),
        x: e.clientX - root.left,
        y: e.clientY - root.top,
      });
    },
    [scale],
  );

  const commitHighlight = async (color: string) => {
    if (!draft) return;
    try {
      const ann = await addAnnotation(attachmentKey, draft.page, color, draft.rects, draft.quoted);
      setAnnotations((a) => [...a, ann].sort((x, y) => x.page - y.page || x.id - y.id));
    } finally {
      setDraft(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const patchAnnotation = (ann: Annotation) =>
    setAnnotations((a) => a.map((x) => (x.id === ann.id ? ann : x)));

  const removeAnnotation = async (id: number) => {
    await deleteAnnotation(id);
    setAnnotations((a) => a.filter((x) => x.id !== id));
    setPopover(null);
  };

  const openAnnotation = (ann: Annotation, e: React.MouseEvent) => {
    e.stopPropagation();
    const root = rootRef.current!.getBoundingClientRect();
    setDraft(null);
    setPopover({ id: ann.id, x: e.clientX - root.left, y: e.clientY - root.top });
  };

  const active = popover ? annotations.find((a) => a.id === popover.id) ?? null : null;

  const [paneW, setPaneW] = useStoredWidth("fishes.lib.reader.w", 640, 420, 1100);
  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 flex-col border-l border-border bg-surface"
      style={{ width: paneW }}
    >
      <ResizeEdge edge="left" width={paneW} onResize={setPaneW} />
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <FileText size={13} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">{name}</span>
        <button
          className="text-muted hover:text-text"
          aria-label={t("Zoom out")}
          onClick={() => setZoom((z) => Math.max(50, z - 10))}
        >
          <Minus size={13} />
        </button>
        <span className="w-9 text-center text-[11px] text-muted">{zoom}%</span>
        <button
          className="text-muted hover:text-text"
          aria-label={t("Zoom in")}
          onClick={() => setZoom((z) => Math.min(300, z + 10))}
        >
          <Plus size={13} />
        </button>
        {ANNOTATE && (
          <button
            className={cn("ml-1", sidebar ? "text-text" : "text-muted hover:text-text")}
            aria-label={t("Annotations")}
            title={t("Annotations")}
            onClick={() => setSidebar((s) => !s)}
          >
            <PanelRight size={13} />
          </button>
        )}
        <button className="ml-1 text-text hover:opacity-60" aria-label={t("Close")} onClick={onClose}>
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-auto bg-surface-2/60 px-4 py-4"
          onMouseUp={onMouseUp}
          onMouseDown={() => setPopover(null)}
        >
          {failed && (
            <div className="p-4 text-sm text-muted">
              {t("Could not open this PDF.")} {failed}
            </div>
          )}
          {!doc && !failed && (
            <div className="flex items-center gap-2 p-4 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> {t("Loading…")}
            </div>
          )}
          {doc &&
            pdfjs &&
            Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
              <PdfPage
                key={n}
                doc={doc}
                pdfjs={pdfjs}
                num={n}
                scale={scale}
                annotations={ANNOTATE ? annotations.filter((a) => a.page === n) : []}
                onAnnotationClick={openAnnotation}
                register={(el) => {
                  if (el) pageEls.current.set(n, el);
                  else pageEls.current.delete(n);
                }}
              />
            ))}
        </div>

        {ANNOTATE && sidebar && (
          <aside className="w-56 shrink-0 overflow-y-auto border-l border-border">
            <div className="px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
              {t("Annotations")}
            </div>
            {annotations.length === 0 && (
              <div className="px-3 py-1 text-[12px] text-muted">
                {t("Select text in the PDF to highlight it.")}
              </div>
            )}
            {annotations.map((a) => (
              <button
                key={a.id}
                onClick={() =>
                  pageEls.current.get(a.page)?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="block w-full border-b border-border/60 px-3 py-2 text-left hover:bg-surface-2/60"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: a.color }}
                  />
                  <span className="text-[10px] text-muted">p.{a.page}</span>
                </span>
                {a.quoted && (
                  <span className="mt-1 line-clamp-3 block text-[12px] leading-snug text-text">
                    {a.quoted}
                  </span>
                )}
                {a.comment && (
                  <span className="mt-0.5 line-clamp-2 block text-[11.5px] italic text-muted">
                    {a.comment}
                  </span>
                )}
              </button>
            ))}
          </aside>
        )}
      </div>

      {/* Color toolbar over a fresh selection */}
      {draft && (
        <div
          className="absolute z-30 flex items-center gap-1.5 rounded-card border border-border bg-surface px-2 py-1.5 shadow-pop"
          style={{ left: clampX(draft.x, rootRef.current, 140), top: draft.y + 10 }}
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              aria-label={t("Highlight")}
              className="h-4 w-4 rounded-full ring-border transition-transform hover:scale-125"
              style={{ backgroundColor: c }}
              onClick={() => void commitHighlight(c)}
            />
          ))}
        </div>
      )}

      {/* Edit popover on an existing highlight */}
      {active && popover && (
        <div
          className="absolute z-30 w-60 rounded-card border border-border bg-surface p-2 shadow-pop"
          style={{ left: clampX(popover.x, rootRef.current, 240), top: popover.y + 10 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                className={cn(
                  "h-4 w-4 rounded-full transition-transform hover:scale-125",
                  active.color === c && "ring-2 ring-accent/60 ring-offset-1",
                )}
                style={{ backgroundColor: c }}
                onClick={() => void updateAnnotation(active.id, { color: c }).then(patchAnnotation)}
              />
            ))}
            <div className="flex-1" />
            <button
              className="text-muted hover:text-red-600"
              aria-label={t("Delete")}
              onClick={() => void removeAnnotation(active.id)}
            >
              <Trash2 size={13} />
            </button>
            <button
              className="text-muted hover:text-text"
              aria-label={t("Close")}
              onClick={() => setPopover(null)}
            >
              <X size={13} />
            </button>
          </div>
          <textarea
            defaultValue={active.comment}
            placeholder={t("Add a comment")}
            rows={2}
            onBlur={(e) => {
              if (e.target.value !== active.comment) {
                void updateAnnotation(active.id, { comment: e.target.value }).then(patchAnnotation);
              }
            }}
            className="mt-2 w-full resize-y rounded-input border border-border bg-surface-2 px-1.5 py-1 text-[13px] text-text outline-none placeholder:text-muted"
          />
        </div>
      )}
    </div>
  );
}

/** Keep a floating box inside the reader horizontally. */
function clampX(x: number, root: HTMLDivElement | null, width: number): number {
  const max = (root?.clientWidth ?? 800) - width - 8;
  return Math.max(8, Math.min(x - width / 2, max));
}

/** Merge fragment rects that sit on the same text line (pdf.js emits one per
 *  span) so a highlight stores a handful of line boxes, not hundreds. */
function mergeLineRects(rects: number[][]): number[][] {
  const lines: number[][] = [];
  for (const r of [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const last = lines[lines.length - 1];
    const midlap =
      last && Math.min(last[3], r[3]) - Math.max(last[1], r[1]) > (r[3] - r[1]) * 0.5;
    if (last && midlap) {
      last[0] = Math.min(last[0], r[0]);
      last[1] = Math.min(last[1], r[1]);
      last[2] = Math.max(last[2], r[2]);
      last[3] = Math.max(last[3], r[3]);
    } else {
      lines.push([...r]);
    }
  }
  return lines;
}

/** One page: renders its canvas + text layer when scrolled near, re-renders
 *  on zoom, and overlays this page's highlights. */
function PdfPage({
  doc,
  pdfjs,
  num,
  scale,
  annotations,
  onAnnotationClick,
  register,
}: {
  doc: PDFDocumentProxy;
  pdfjs: PdfjsModule;
  num: number;
  scale: number;
  annotations: Annotation[];
  onAnnotationClick: (ann: Annotation, e: React.MouseEvent) => void;
  register: (el: HTMLDivElement | null) => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(num);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setBase({ w: viewport.width / scale, h: viewport.height / scale });
      const canvas = canvasRef.current;
      const textDiv = textRef.current;
      if (!canvas || !textDiv) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      }).promise;
      if (cancelled) return;
      textDiv.replaceChildren();
      const tl = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport,
      });
      await tl.render();
    })().catch(() => {
      /* a failed page render leaves the placeholder — no crash */
    });
    return () => {
      cancelled = true;
    };
  }, [visible, scale, doc, pdfjs, num]);

  const w = base ? base.w * scale : undefined;
  const h = base ? base.h * scale : 900 * scale;

  return (
    <div
      ref={(el) => {
        (holderRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        register(el);
      }}
      data-pdf-page={num}
      className="relative mx-auto mb-4 bg-white shadow-card"
      style={{ width: w, height: h, ["--scale-factor" as string]: String(scale) }}
    >
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
      {/* Highlights sit between the canvas and the text layer, so text stays
          selectable while the color multiplies into the page. */}
      {annotations.map((a) => {
        let rects: number[][] = [];
        try {
          rects = JSON.parse(a.rects) as number[][];
        } catch {
          /* unreadable rects — skip drawing this annotation */
        }
        return rects.map((r, i) => (
          <div
            key={`${a.id}-${i}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => onAnnotationClick(a, e)}
            className="absolute cursor-pointer"
            style={{
              left: r[0] * scale,
              top: r[1] * scale,
              width: (r[2] - r[0]) * scale,
              height: (r[3] - r[1]) * scale,
              backgroundColor: a.color,
              opacity: 0.35,
              mixBlendMode: "multiply",
            }}
          />
        ));
      })}
      <div ref={textRef} className="textLayer" />
    </div>
  );
}
