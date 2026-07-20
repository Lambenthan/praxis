import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { ArtifactInspector as ArtifactInspectorT, ArtifactTab } from "@fishes/shared";
import { useScrollMemory } from "@/lib/scrollMemory";
import { cn } from "@/lib/cn";
import { CodeViewer } from "@/components/code-viewer/CodeViewer";
import { PaneTitlebarInset } from "./RightPane";
import { resolveArtifactContent } from "@/lib/artifacts";
import { saveTextWithFeedback } from "@/lib/download";
import { useT } from "@/lib/i18n";

const TABS: ArtifactTab[] = ["Code", "Execution Log", "Messages", "Environment", "Review"];

export function ArtifactInspector({
  data,
  onClose,
  controls,
}: {
  data: ArtifactInspectorT;
  onClose: () => void;
  /** Pane-level header buttons (e.g. maximize), rendered before Close. */
  controls?: React.ReactNode;
}) {
  const t = useT();
  const [tab, setTab] = useState<ArtifactTab>("Code");
  const [versionIdx, setVersionIdx] = useState(() =>
    Math.max(0, data.versions.findIndex((v) => v.label === data.activeVersion)),
  );

  const activeLabel = data.versions[versionIdx]?.label ?? data.activeVersion;
  const content = resolveArtifactContent(data, activeLabel);
  const scriptName = data.filename ?? data.title;

  const step = (delta: number) =>
    setVersionIdx((i) => Math.min(data.versions.length - 1, Math.max(0, i + delta)));

  // Viewing position per artifact tab, restored when reopened.
  const scrollRef = useRef<HTMLDivElement>(null);
  const onScroll = useScrollMemory(scrollRef, `artifact:${data.title}:${tab}`);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <PaneTitlebarInset />
        <span className="truncate text-sm font-medium text-text">{data.title}</span>
        <div className="ml-2 flex items-center gap-1 text-text">
          <button
            className="disabled:opacity-30 hover:opacity-60"
            aria-label={t("Previous version")}
            onClick={() => step(-1)}
            disabled={versionIdx === 0}
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </button>
          <span className="rounded bg-surface-2 px-1.5 text-xs text-muted">{activeLabel}</span>
          <button
            className="disabled:opacity-30 hover:opacity-60"
            aria-label={t("Next version")}
            onClick={() => step(1)}
            disabled={versionIdx >= data.versions.length - 1}
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1" />
        <button
          className="text-text hover:opacity-60"
          aria-label={t("Download")}
          onClick={() => void saveTextWithFeedback(scriptName, content.code)}
        >
          <Download size={14} strokeWidth={1.5} />
        </button>
        {controls}
        <button className="text-text hover:opacity-60" aria-label={t("Close inspector")} onClick={onClose}>
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>

      <nav className="flex items-center gap-4 border-b border-border px-4">
        {TABS.map((tabName) => (
          <button
            key={tabName}
            onClick={() => setTab(tabName)}
            className={cn(
              "flex items-center gap-1 border-b-2 py-2.5 text-sm",
              tab === tabName
                ? "border-accent text-text"
                : "border-transparent text-muted hover:text-text",
            )}
          >
            {t(tabName)}
            {tabName === "Review" && content.reviewPassed && <Check size={13} className="text-ok" />}
          </button>
        ))}
      </nav>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4">
        {tab === "Code" && (
          <div className="space-y-3">
            <button
              className="flex items-center gap-2 rounded-input bg-link px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              onClick={() => void saveTextWithFeedback(scriptName, content.code)}
            >
              <Download size={15} /> {t("Download script")}
            </button>
            {data.inputs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">{t("Inputs")}</span>
                {data.inputs.map((f) => (
                  <span
                    key={f}
                    className="rounded-input bg-surface-2 px-2 py-1 font-mono text-xs text-text ring-1 ring-border"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
            <CodeViewer code={content.code} language={data.language} startLine={data.codeStartLine} />
          </div>
        )}
        {tab === "Execution Log" && <Pre text={content.executionLog ?? t("No execution log.")} />}
        {tab === "Messages" && (
          <ul className="space-y-2">
            {(content.messages ?? []).map((m, i) => (
              <li key={i} className="rounded-input bg-surface-2 px-3 py-2 text-sm text-text">
                {m}
              </li>
            ))}
            {(content.messages ?? []).length === 0 && (
              <li className="text-sm text-muted">{t("No messages for this version.")}</li>
            )}
          </ul>
        )}
        {tab === "Environment" && <Pre text={content.environment ?? t("No environment info.")} />}
        {tab === "Review" &&
          (content.reviewPassed ? (
            <div className="flex items-center gap-2 text-sm text-ok">
              <Check size={16} /> {t("Review passed —")} {activeLabel} {t("traces to code and inputs.")}
            </div>
          ) : (
            <div className="text-sm text-muted">{activeLabel} {t("has not passed review yet.")}</div>
          ))}
      </div>
    </div>
  );
}

function Pre({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap rounded-input border border-border bg-surface-2 p-3 font-mono text-[14px] text-text">
      {text}
    </pre>
  );
}
