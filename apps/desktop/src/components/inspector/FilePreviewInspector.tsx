import { useEffect, useRef, useState } from "react";
import { Code2, Eye, ExternalLink, FileSearch, History, Loader2, X } from "lucide-react";
import type { FilePreviewInspector as FilePreviewInspectorT, FileRoot } from "@ai4s/shared";
import { previewKindForName, type PreviewKind } from "@/lib/artifacts";
import {
  base64ToBytes,
  openArtifactExternally,
  previewUrl,
  probeLargeFile,
  readArtifact,
  type LargeFilePointer,
} from "@/lib/artifactFile";
import { parseTableFile } from "@/lib/csv";
import { CodeViewer } from "@/components/code-viewer/CodeViewer";
import { MarkdownViewer } from "@/components/markdown-viewer/MarkdownViewer";
import { ProvenancePanel } from "./ProvenancePanel";
import { TablePreview } from "./TablePreview";
import { TableChart } from "./TableChart";
import { canChart } from "@/lib/tableChart";
import { DocxView, PptxView, XlsxView } from "./OfficePreview";
import { MoleculeView } from "./MoleculeView";
import { MeshView } from "./MeshView";
import { GenomeView } from "./GenomeView";
import { FitsView } from "./FitsView";
import { DosView } from "./DosView";
import { BandView } from "./BandView";
import { QCodeView } from "./QCodeView";
import { QCodeWorkbench } from "@/components/qcode/QCodeWorkbench";
import { QRegWorkbench } from "@/components/qreg/QRegWorkbench";
import { AnomalyMapView } from "./AnomalyMapView";
import { PhaseView } from "./PhaseView";
import { useScrollMemory } from "@/lib/scrollMemory";
import { cn } from "@/lib/cn";
import { PaneTitlebarInset } from "./RightPane";
import { useT } from "@/lib/i18n";

/**
 * Right-pane preview for any workspace file. Strategy (no format conversion):
 * pdf / image / html — served from the local file server (http://127.0.0.1)
 * and rendered by the webview's NATIVE viewers via <iframe>/<img>;
 * csv/tsv — parsed to a table; docx/xlsx/pptx — local JS renderers fed raw
 * bytes; everything else — code/text.
 */
export function FilePreviewInspector({
  data,
  onClose,
  controls,
}: {
  data: FilePreviewInspectorT;
  onClose: () => void;
  /** Pane-level header buttons (e.g. maximize), rendered before Close. */
  controls?: React.ReactNode;
}) {
  const t = useT();
  const kind = previewKindForName(data.filename);
  const needsUrl = kind === "pdf" || kind === "image" || kind === "html";
  const needsText =
    kind === "table" || kind === "text" || kind === "html" || kind === "markdown" ||
    kind === "molecule" || kind === "genome" || kind === "qcode" || kind === "qreg" ||
    kind === "anomaly" || kind === "phase";
  const needsBytes =
    kind === "docx" || kind === "xlsx" || kind === "pptx" || kind === "mesh" ||
    kind === "fits" || kind === "dos" || kind === "bands";

  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(data.content ?? null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "code">(kind === "text" ? "code" : "preview");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    // Reset per-file state up front: the same inspector instance is reused when
    // the user opens a different file, and the async loads below only fill in
    // what the NEW file needs — without this, the previous file's text/url/bytes
    // would linger and bleed into the new preview.
    setText(data.content ?? null);
    setUrl(null);
    setBytes(null);
    (async () => {
      try {
        if (needsUrl) {
          const u = await previewUrl(data.path, data.root);
          if (cancelled) return;
          setUrl(u);
          // Browser dev has no local server; html can still preview inline content.
          if (!u && kind !== "html") {
            setError(t("Preview is available in the desktop app."));
          }
        }
        if (needsText && data.content === undefined) {
          const f = await readArtifact(data.path, data.root);
          if (cancelled) return;
          if (f && f.encoding === "utf8") setText(f.data);
          // The file was read but isn't text — say so instead of falling
          // through to the "desktop app" note while inside the desktop app.
          else if (f) setError(t("This file is binary and has no preview — open it externally."));
          else if (kind !== "html" && kind !== "markdown")
            setError(t("Preview is available in the desktop app."));
        }
        if (needsBytes) {
          const f = await readArtifact(data.path, data.root);
          if (cancelled) return;
          if (f && f.encoding === "base64") setBytes(base64ToBytes(f.data));
          else setError(t("Preview is available in the desktop app."));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.path, data.content, data.root, kind, needsUrl, needsText, needsBytes]);

  const canToggle =
    kind === "html" || kind === "markdown" || kind === "molecule" || kind === "genome";

  // Where the user was in this file, restored when they come back to it —
  // history browsing keeps its own offset so the two don't clobber each other.
  const scrollRef = useRef<HTMLDivElement>(null);
  const onScroll = useScrollMemory(
    scrollRef,
    showHistory ? `history:${data.path}` : `file:${data.path}`,
    showHistory || !loading,
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <PaneTitlebarInset />
        <span className="truncate text-sm font-medium text-text">{data.filename}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{data.artifact}</span>
        {canToggle && (
          <div className="ml-2 flex items-center gap-1 rounded-input bg-surface-2 p-0.5">
            <ToggleBtn active={tab === "preview"} onClick={() => setTab("preview")}>
              <Eye size={13} /> {t("Preview")}
            </ToggleBtn>
            <ToggleBtn active={tab === "code"} onClick={() => setTab("code")}>
              <Code2 size={13} /> {t("Code")}
            </ToggleBtn>
          </div>
        )}
        <div className="flex-1" />
        <button
          className={cn(showHistory ? "text-accent" : "text-text hover:opacity-60")}
          aria-label={t("History")}
          title={t("History — every recorded version with its code and conversation")}
          aria-pressed={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          <History size={14} strokeWidth={1.5} />
        </button>
        <button
          className="text-text hover:opacity-60"
          aria-label={t("Open externally")}
          title={t("Open in the default app")}
          onClick={() => void openArtifactExternally(data.path, data.root)}
        >
          <ExternalLink size={14} strokeWidth={1.5} />
        </button>
        {controls}
        <button className="text-text hover:opacity-60" aria-label={t("Close inspector")} onClick={onClose}>
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto bg-surface-2">
        {showHistory && <ProvenancePanel path={data.path} language={data.language} />}
        {!showHistory && loading && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted">
            <Loader2 size={15} className="animate-spin" /> {t("Loading")} {data.filename}…
          </div>
        )}
        {!showHistory && !loading && error && (
          <PreviewError
            error={error}
            filename={data.filename}
            path={data.path}
            root={data.root}
            onOpenExternally={() => void openArtifactExternally(data.path, data.root)}
          />
        )}
        {!showHistory && !loading && !error && (
          <Body
            kind={kind}
            url={url}
            text={text}
            bytes={bytes}
            showCode={tab === "code"}
            filename={data.filename}
            path={data.path}
            language={data.language}
          />
        )}
      </div>
    </div>
  );
}

function Body({
  kind,
  url,
  text,
  bytes,
  showCode,
  filename,
  path,
  language,
}: {
  kind: PreviewKind;
  url: string | null;
  text: string | null;
  bytes: ArrayBuffer | null;
  showCode: boolean;
  filename: string;
  path: string;
  language?: string;
}) {
  const t = useT();
  if (kind === "docx" || kind === "xlsx" || kind === "pptx") {
    // Office views scroll internally (the outer pane never does), so they
    // carry their own scroll memory, keyed apart from the outer container's.
    if (!bytes) return <Note text={t("Preview is available in the desktop app.")} />;
    if (kind === "docx") return <DocxView bytes={bytes} scrollKey={`office:${path}`} />;
    if (kind === "xlsx") return <XlsxView bytes={bytes} scrollKey={`office:${path}`} />;
    return <PptxView bytes={bytes} scrollKey={`office:${path}`} />;
  }
  if (kind === "mesh") {
    return bytes !== null ? (
      <MeshView filename={filename} bytes={bytes} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "fits") {
    return bytes !== null ? (
      <FitsView filename={filename} bytes={bytes} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "dos") {
    return bytes !== null ? (
      <DosView filename={filename} bytes={bytes} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "bands") {
    return bytes !== null ? (
      <BandView filename={filename} bytes={bytes} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "qcode") {
    return text !== null ? (
      <QCodeSurface filename={filename} text={text} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "qreg") {
    return text !== null ? (
      <QRegWorkbench filename={filename} text={text} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "anomaly") {
    return text !== null ? (
      <AnomalyMapView filename={filename} text={text} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "phase") {
    return text !== null ? (
      <PhaseView filename={filename} text={text} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "molecule") {
    if (showCode) {
      return text !== null ? (
        <div className="p-3">
          <CodeViewer code={text} language={language} />
        </div>
      ) : (
        <Note text={t("Source is available in the desktop app.")} />
      );
    }
    return text !== null ? (
      <MoleculeView filename={filename} text={text} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "genome") {
    if (showCode) {
      return text !== null ? (
        <div className="p-3">
          <CodeViewer code={text} language={language} />
        </div>
      ) : (
        <Note text={t("Source is available in the desktop app.")} />
      );
    }
    return text !== null ? (
      <GenomeView filename={filename} text={text} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "markdown") {
    if (showCode) {
      return text !== null ? (
        <div className="p-3">
          <CodeViewer code={text} language="markdown" />
        </div>
      ) : (
        <Note text={t("Source is available in the desktop app.")} />
      );
    }
    // A document reads as a page: white paper, black text, whatever the app
    // theme — the same document-neutral canvas the Office previews use.
    return text !== null ? (
      <div className="min-h-full px-6 py-8">
        <div className="mx-auto max-w-[760px] rounded-sm bg-white px-12 py-11 shadow-[0_1px_4px_rgba(0,0,0,.25)] max-sm:px-6 max-sm:py-7">
          <MarkdownViewer variant="document">{text}</MarkdownViewer>
        </div>
      </div>
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "html" && showCode) {
    return text !== null ? (
      <div className="p-3">
        <CodeViewer code={text} language="html" />
      </div>
    ) : (
      <Note text={t("Source is available in the desktop app.")} />
    );
  }
  if (kind === "html") {
    // Served URL preferred (relative assets resolve); srcdoc as browser fallback.
    if (url) {
      return <iframe title={t("HTML preview")} src={url} sandbox="allow-scripts" className="h-full min-h-[480px] w-full bg-white" />;
    }
    if (text !== null) {
      return <iframe title={t("HTML preview")} srcDoc={text} sandbox="allow-scripts" className="h-full min-h-[480px] w-full bg-white" />;
    }
    return <Note text={t("Preview is available in the desktop app.")} />;
  }
  if (kind === "pdf") {
    // The webview's native PDF viewer (WKWebView / WebView2) renders the served URL.
    return url ? (
      <iframe title={t("PDF preview")} src={url} className="h-full min-h-[480px] w-full" />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "image") {
    return url ? (
      <div className="flex justify-center p-4">
        <img src={url} alt={filename} className="max-w-full rounded-sm bg-white shadow-card" />
      </div>
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  if (kind === "table") {
    return text !== null ? (
      <TableView table={parseTableFile(filename, text)} />
    ) : (
      <Note text={t("Preview is available in the desktop app.")} />
    );
  }
  return text !== null ? (
    <div className="p-3">
      <CodeViewer code={text} language={language} />
    </div>
  ) : (
    <Note text={t("Preview is available in the desktop app.")} />
  );
}

function Note({ text }: { text: string }) {
  return <div className="p-4 text-sm text-muted">{text}</div>;
}

/** qcode file: toggle between the read-only QCodeView and the interactive
 *  QCodeWorkbench. Persistence back to disk is deliberately out of scope here
 *  (adjudication results ultimately flow to the concept layer during skill
 *  integration); this seam only proves the interaction end to end. */
function QCodeSurface({ filename, text }: { filename: string; text: string }) {
  const t = useT();
  const [adjudicate, setAdjudicate] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <button
          onClick={() => setAdjudicate(false)}
          className={cn(
            "rounded-input px-2 py-0.5 text-[11px]",
            !adjudicate ? "bg-surface-2 text-text" : "text-muted hover:text-text",
          )}
        >
          {t("Preview")}
        </button>
        <button
          onClick={() => setAdjudicate(true)}
          className={cn(
            "rounded-input px-2 py-0.5 text-[11px]",
            adjudicate ? "bg-surface-2 text-text" : "text-muted hover:text-text",
          )}
        >
          {t("Adjudicate")}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {adjudicate ? (
          <QCodeWorkbench filename={filename} text={text} />
        ) : (
          <QCodeView filename={filename} text={text} />
        )}
      </div>
    </div>
  );
}

/** Tabular file preview with a Table ↔ Chart toggle. The Chart tab appears only
 *  when the data has a numeric column to plot (P1-5 native chart surface). */
function TableView({ table }: { table: import("@/lib/csv").ParsedTable }) {
  const t = useT();
  const [view, setView] = useState<"table" | "chart">("table");
  const chartable = canChart(table);
  return (
    <div className="flex h-full flex-col">
      {chartable && (
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
          <ToggleBtn active={view === "table"} onClick={() => setView("table")}>
            {t("Table")}
          </ToggleBtn>
          <ToggleBtn active={view === "chart"} onClick={() => setView("chart")}>
            {t("Chart")}
          </ToggleBtn>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "chart" && chartable ? (
          <TableChart table={table} />
        ) : (
          <TablePreview table={table} />
        )}
      </div>
    </div>
  );
}

/** Preview errors. A "too large" file gets a helpful card — the preview is
 *  capped so a huge file can't lock the app. The user can open it in the OS
 *  app, or **inspect it without loading**: the large-file probe returns a
 *  compact memory pointer (schema / shape / sample / key numbers) by streaming
 *  and sampling, so even a 90 GB file is introspected, never loaded. */
export function PreviewError({
  error,
  filename,
  path,
  root,
  onOpenExternally,
}: {
  error: string;
  filename: string;
  path?: string;
  root?: FileRoot;
  onOpenExternally: () => void;
}) {
  const t = useT();
  const tooLarge = /too large/i.test(error);
  const [pointer, setPointer] = useState<LargeFilePointer | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const inspect = async () => {
    if (!path) return;
    setProbing(true);
    setProbeError(null);
    try {
      setPointer(await probeLargeFile(path, root));
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : String(e));
    } finally {
      setProbing(false);
    }
  };

  if (!tooLarge) return <div className="p-4 text-sm text-muted">{error}</div>;
  return (
    <div className="p-4">
      <div className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
        <div className="mb-1 font-medium text-text">{filename} {t("is too large to preview")}</div>
        <p className="mb-3">
          {t(
            "Previews are capped so a large file can't freeze the app. Inspect it without loading — the large-file probe reads its schema, shape, a sample, and key numbers by streaming, never loading the whole file — or open it in your system app.",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {path && (
            <button
              className="inline-flex items-center gap-1.5 rounded-input border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] text-text hover:bg-surface disabled:opacity-60"
              onClick={() => void inspect()}
              disabled={probing}
            >
              {probing ? <Loader2 size={13} className="animate-spin" /> : <FileSearch size={13} />}
              {t("Inspect without loading")}
            </button>
          )}
          <button
            className="inline-flex items-center gap-1.5 rounded-input border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] text-text hover:bg-surface"
            onClick={onOpenExternally}
          >
            <ExternalLink size={13} /> {t("Open externally")}
          </button>
        </div>
        {probeError && <div className="mt-3 text-[13px] text-error">{probeError}</div>}
        {pointer && <LargeFilePointerPanel p={pointer} />}
      </div>
    </div>
  );
}

/** Render the probe's memory pointer as a compact, readable fact sheet. */
function LargeFilePointerPanel({ p }: { p: LargeFilePointer }) {
  const t = useT();
  if (p.error) return <div className="mt-3 text-[13px] text-error">{p.error}</div>;
  const fmt = (n: number) => n.toLocaleString("en-US");
  const rows: [string, string][] = [];
  if (p.format) rows.push([t("Format"), p.format]);
  if (p.size) rows.push([t("Size"), p.size + (p.gzipped ? ` (${t("gzipped")})` : "")]);
  if (p.approx_rows !== undefined) rows.push([t("Rows (approx.)"), fmt(p.approx_rows)]);
  if (p.num_rows !== undefined) rows.push([t("Rows"), fmt(p.num_rows)]);
  if (p.approx_reads !== undefined) rows.push([t("Reads (approx.)"), fmt(p.approx_reads)]);
  if (p.approx_sequences !== undefined) rows.push([t("Sequences (approx.)"), fmt(p.approx_sequences)]);
  if (p.approx_variants !== undefined) rows.push([t("Variants (approx.)"), fmt(p.approx_variants)]);
  if (p.n_columns !== undefined) rows.push([t("Columns"), fmt(p.n_columns)]);
  if (p.read_length) rows.push([t("Read length"), `${p.read_length.min}–${p.read_length.max} (${t("mean")} ${p.read_length.mean})`]);
  if (p.samples?.length) rows.push([t("Samples"), p.samples.join(", ")]);

  return (
    <div className="mt-3 rounded-input border border-border bg-surface-2 p-3">
      {p.hint && <div className="mb-2 text-[13px] text-text">{p.hint}</div>}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[12.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-all font-mono text-text">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.columns && p.columns.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[12px] text-muted">{t("Schema")}</div>
          <div className="flex flex-wrap gap-1">
            {p.columns.slice(0, 40).map((c) => (
              <span key={c.name} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11.5px] text-text">
                {c.name} <span className="text-muted">{c.dtype}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {p.datasets && p.datasets.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[12px] text-muted">{t("Datasets")}</div>
          <div className="flex flex-col gap-0.5 font-mono text-[11.5px] text-text">
            {p.datasets.slice(0, 20).map((d) => (
              <span key={d.path}>{d.path} <span className="text-muted">[{d.shape.join("×")}] {d.dtype}</span></span>
            ))}
          </div>
        </div>
      )}
      {p.sample_ids && p.sample_ids.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[12px] text-muted">{t("Sample ids")}</div>
          <div className="font-mono text-[11.5px] text-text">{p.sample_ids.slice(0, 5).join(", ")}</div>
        </div>
      )}
      {p.note && <div className="mt-2 text-[11.5px] italic text-muted">{p.note}</div>}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-xs",
        active ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
