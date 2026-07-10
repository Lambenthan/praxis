import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { isTauri } from "@/lib/tauri";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";

// Minimal shapes from @tauri-apps/plugin-updater (imported dynamically so the
// browser build never pulls the Tauri-only module).
interface UpdateHandle {
  version: string;
  currentVersion: string;
  body?: string;
  downloadAndInstall: (
    onEvent: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
  ) => Promise<void>;
}

type Phase = "hidden" | "available" | "downloading" | "error";

/**
 * Self-update gate. On launch it silently asks the update endpoint whether a
 * newer version exists; if so it shows one modal — "Update & restart" or
 * "Later". Update downloads with a progress bar and relaunches into the new
 * version; Later dismisses until the next launch. A failed or offline check is
 * silent — the app is fully usable without ever updating. Non-blocking by
 * design (the user can keep working and update next time); flip `mandatory` to
 * force it.
 */
export function UpdateGate({ mandatory = false }: { mandatory?: boolean }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [info, setInfo] = useState<{ version: string; body: string } | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const handleRef = useRef<UpdateHandle | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = (await check()) as UpdateHandle | null;
        if (update && !cancelled) {
          handleRef.current = update;
          setInfo({ version: update.version, body: update.body?.trim() ?? "" });
          setPhase("available");
        }
      } catch {
        // Offline, endpoint unreachable, or no release yet — never surface it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runUpdate = async () => {
    const update = handleRef.current;
    if (!update) return;
    setPhase("downloading");
    setPct(0);
    try {
      let total = 0;
      let got = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data?.chunkLength ?? 0;
          if (total > 0) setPct(Math.min(100, Math.round((got / total) * 100)));
        } else if (e.event === "Finished") setPct(100);
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch(); // app restarts into the new version
    } catch {
      setPhase("error");
    }
  };

  if (phase === "hidden" || !info) return null;

  const downloading = phase === "downloading";
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35"
      role="presentation"
      // The backdrop dismisses only when it's optional and not mid-download.
      onClick={() => {
        if (!mandatory && !downloading) setPhase("hidden");
      }}
    >
      <div
        role="alertdialog"
        aria-label={t("A new version is available")}
        className="w-[380px] rounded-card border border-border bg-surface p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/30">
            <Sparkles size={17} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="font-serif text-[15px] text-text">{t("A new version is available")}</div>
            <div className="text-xs text-muted">
              {info.version}
              {handleRef.current?.currentVersion
                ? ` · ${t("current")} ${handleRef.current.currentVersion}`
                : ""}
            </div>
          </div>
        </div>

        {info.body && phase === "available" && (
          <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-input bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
            {info.body}
          </div>
        )}

        {phase === "error" && (
          <p className="mt-3 text-sm text-error">
            {t("The update could not be installed. Check your connection and try again.")}
          </p>
        )}

        {downloading && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" />
              {pct != null ? `${t("Downloading the update…")} ${pct}%` : t("Downloading the update…")}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${pct ?? 5}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted/80">
              {t("The app will restart into the new version when this finishes.")}
            </p>
          </div>
        )}

        {!downloading && (
          <div className="mt-4 flex justify-end gap-2">
            {!mandatory && (
              <button
                className="rounded-input border border-border px-3.5 py-1.5 text-sm text-text transition-colors hover:bg-surface-2"
                onClick={() => setPhase("hidden")}
              >
                {t("Later")}
              </button>
            )}
            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded-input bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90",
              )}
              onClick={() => void runUpdate()}
            >
              <Download size={14} />
              {phase === "error" ? t("Try again") : t("Update & restart")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
