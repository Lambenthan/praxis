import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, MessageSquare, Package, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ProvenanceRecord } from "@ai4s/shared";
import { listProvenance, readEnvLockfile } from "@/lib/provenance";
import { useUiStore } from "@/lib/store";
import { CodeViewer } from "@/components/code-viewer/CodeViewer";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/** The prompt the Reproduce action drafts — prefilled, reviewed, user-sent. */
export function reproducePrompt(r: ProvenanceRecord): string {
  const pkgs = r.env?.packages;
  const pkgNote = pkgs
    ? ` The environment had ${pkgs.count} installed Python packages, listed in \`.openscience/env/${pkgs.hash}.txt\` — if the regenerated result differs, install matching versions from that lockfile and re-run.`
    : "";
  const env = r.env
    ? ` It was produced with${r.env.python ? ` Python ${r.env.python} on` : ""} ${r.env.platform}.${pkgNote}`
    : "";
  const content = r.content ?? "";
  // A fence longer than any backtick run in the content, so embedded ``` in
  // the recorded code (e.g. a generated report.md) cannot close it early.
  const fence = "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
  // Records are capped at 100 KB (provenance.rs cap_content) — a truncated
  // record is not runnable, so tell the agent where the full code lives.
  const truncNote = content.endsWith("[truncated]")
    ? " NOTE: the recorded code below is truncated at the store's size cap — read the full " +
      `record for \`${r.path}\` from \`.openscience/provenance.jsonl\` before re-running.`
    : "";
  return (
    `Reproduce \`${r.path}\` (provenance v${r.version}).${env} ` +
    `Re-run its recorded generating code below, then compare the regenerated file ` +
    `with the current \`${r.path}\` and report whether they match — and what changed if not.` +
    `${truncNote}\n\n${fence}\n${content}\n${fence}`
  );
}

function longestBacktickRun(text: string): number {
  let max = 0;
  for (const run of text.match(/`+/g) ?? []) max = Math.max(max, run.length);
  return max;
}

/**
 * The provenance History of one artifact: every recorded version with the code
 * that produced it, the tool, the model, and a link back to the originating
 * conversation. Data comes from `.openscience/provenance.jsonl` (P0-3).
 */
export function ProvenancePanel({ path, language }: { path: string; language?: string }) {
  const t = useT();
  const [records, setRecords] = useState<ProvenanceRecord[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  // The package lockfile currently shown, keyed by its content hash.
  const [lockfile, setLockfile] = useState<{ hash: string; text: string | null } | null>(null);
  const navigate = useNavigate();
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);

  // Toggle the pip-freeze lockfile for a snapshot hash; loads it lazily on open.
  const toggleLockfile = (hash: string) => {
    if (lockfile?.hash === hash) {
      setLockfile(null);
      return;
    }
    setLockfile({ hash, text: null });
    void readEnvLockfile(hash).then((text) =>
      setLockfile((cur) => (cur?.hash === hash ? { hash, text: text ?? "(lockfile unavailable)" } : cur)),
    );
  };

  // Draft the reproduce prompt into the conversation the version came from —
  // the user reviews and sends it (human in the loop, never auto-run).
  const reproduce = (r: ProvenanceRecord) => {
    setComposerDraft(reproducePrompt(r));
    navigate(r.sessionId ? `/live/${r.sessionId}` : "/live");
  };

  useEffect(() => {
    let cancelled = false;
    setRecords(null);
    void listProvenance(path).then((r) => {
      if (cancelled) return;
      setRecords([...r].reverse()); // newest first
      setExpanded(r.length > 0 ? r[r.length - 1].version : null);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (records === null) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> {t("Loading history…")}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="p-4 text-sm text-muted">
        {t("No versions recorded yet. Each time the agent writes")}{" "}
        <span className="font-mono text-text">{path}</span>{t(", a version is added here with the code, model, and conversation that produced it.")}
      </div>
    );
  }

  return (
    <ul className="space-y-2 p-3">
      {records.map((r) => {
        const open = expanded === r.version;
        return (
          <li key={r.version} className="rounded-input border border-border bg-surface">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
              onClick={() => setExpanded(open ? null : r.version)}
              aria-expanded={open}
            >
              {open ? (
                <ChevronDown size={14} className="shrink-0 text-muted" />
              ) : (
                <ChevronRight size={14} className="shrink-0 text-muted" />
              )}
              <span className="rounded bg-surface-2 px-1.5 text-xs font-medium text-text">
                v{r.version}
              </span>
              <span className="font-mono text-xs text-muted">{r.tool}</span>
              <span className="flex-1" />
              <span className="text-xs text-muted">{formatTs(r.ts)}</span>
            </button>
            {open && (
              <div className="space-y-2 border-t border-border px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {r.model && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{r.model}</span>
                  )}
                  {r.env && (
                    <span
                      className="rounded bg-surface-2 px-1.5 py-0.5 font-mono"
                      title={t("Environment this version was produced in")}
                    >
                      {[r.env.python && `py ${r.env.python}`, r.env.platform, `app ${r.env.app}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {r.env?.packages && (
                    <button
                      className={cn(
                        "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono hover:bg-surface-2 hover:text-text",
                        lockfile?.hash === r.env.packages.hash && "bg-surface-2 text-text",
                      )}
                      onClick={() => toggleLockfile(r.env!.packages!.hash)}
                      title={t("View the captured pip freeze lockfile for this version")}
                      aria-pressed={lockfile?.hash === r.env.packages.hash}
                    >
                      <Package size={11} /> {r.env.packages.count} {t("packages")}
                    </button>
                  )}
                  {r.log && <span className="truncate">{r.log}</span>}
                  <span className="flex-1" />
                  {r.content && (
                    <button
                      className="flex items-center gap-1 text-link hover:underline"
                      onClick={() => reproduce(r)}
                      title={t("Draft a prompt that re-runs this version's code and compares the result")}
                    >
                      <RotateCcw size={12} /> {t("Reproduce")}
                    </button>
                  )}
                  {r.sessionId && (
                    <button
                      className="flex items-center gap-1 text-link hover:underline"
                      onClick={() => navigate(`/live/${r.sessionId}`)}
                      title={t("Open the conversation this version came from")}
                    >
                      <MessageSquare size={12} /> {t("Open conversation")}
                    </button>
                  )}
                </div>
                {r.env?.packages && lockfile?.hash === r.env.packages.hash && (
                  <div className="rounded-input border border-border bg-surface-2">
                    <div className="border-b border-border px-2.5 py-1 text-[11px] text-muted">
                      {t("pip freeze")} · {r.env.packages.count} {t("packages")}
                    </div>
                    {lockfile.text === null ? (
                      <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted">
                        <Loader2 size={12} className="animate-spin" /> {t("Loading…")}
                      </div>
                    ) : (
                      <pre className="max-h-48 overflow-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text">
                        {lockfile.text}
                      </pre>
                    )}
                  </div>
                )}
                {r.content ? (
                  <CodeViewer code={r.content} language={language} />
                ) : (
                  <div className={cn("text-xs text-muted")}>
                    {t("Content not captured for this version (binary or produced by running code).")}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function formatTs(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
