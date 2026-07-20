import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { isTauri } from "@/lib/tauri";
import { useT } from "@/lib/i18n";
import { version as pkgVersion } from "../../../package.json";
import { SettingsSection } from "./SettingsSection";
import { SettingRow } from "./SettingRow";
import { LicensesDialog } from "./LicensesDialog";
import { btnAccent, btnGhost } from "./controls";

// Minimal shape of a @tauri-apps/plugin-updater handle (dynamically imported so
// the browser build never pulls the Tauri-only module — mirrors UpdateGate).
interface UpdateHandle {
  version: string;
  currentVersion: string;
  downloadAndInstall: (onEvent?: (e: unknown) => void) => Promise<void>;
}

type CheckPhase =
  | "idle"
  | "checking"
  | "uptodate"
  | "available"
  | "unavailable"
  | "error";

/**
 * About: app name + version, an on-demand update check that reuses the real
 * Tauri updater (the same mechanism as the launch-time UpdateGate), and the
 * Third-Party Licenses list. The update row only claims "up to date" after an
 * actual check has run; outside the desktop app it says so plainly rather than
 * faking a result.
 */
export function AboutSection() {
  const t = useT();
  const [appVersion, setAppVersion] = useState<string>(pkgVersion);
  const [phase, setPhase] = useState<CheckPhase>("idle");
  const [latest, setLatest] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const handleRef = useRef<UpdateHandle | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    void import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setAppVersion)
      .catch(() => {
        /* keep the package.json version */
      });
  }, []);

  const check = async () => {
    if (!isTauri) {
      setPhase("unavailable");
      return;
    }
    setPhase("checking");
    setApplyError(null);
    try {
      const { check: checkForUpdate } = await import("@tauri-apps/plugin-updater");
      const update = (await checkForUpdate()) as UpdateHandle | null;
      if (update) {
        handleRef.current = update;
        setLatest(update.version);
        setPhase("available");
      } else {
        setPhase("uptodate");
      }
    } catch {
      setPhase("error");
    }
  };

  const apply = async () => {
    const update = handleRef.current;
    if (!update) return;
    setApplying(true);
    setApplyError(null);
    try {
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch(); // restarts into the new version
    } catch (e) {
      setApplyError(
        `${t("The update could not be installed. Check your connection and try again.")} ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      setApplying(false);
    }
  };

  const statusLine =
    phase === "checking"
      ? t("Checking for updates…")
      : phase === "uptodate"
        ? t("You're up to date.")
        : phase === "available"
          ? t("A new version is ready to install.")
          : phase === "unavailable"
            ? t("Updates are available in the desktop app.")
            : phase === "error"
              ? t("Could not check for updates. Check your connection and try again.")
              : t("Check whether a newer version is available.");

  return (
    <SettingsSection title={t("About")} hint={t("Fishes — an AI workbench for social-science research.")}>
      <SettingRow
        label={t("Version")}
        description={statusLine}
        control={
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs tabular-nums text-muted">{appVersion}</span>
            <button
              className={btnGhost("gap-1.5")}
              onClick={() => void check()}
              disabled={phase === "checking" || applying}
            >
              {phase === "checking" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              {phase === "checking" ? t("Checking…") : t("Check for updates")}
            </button>
          </div>
        }
        below={
          phase === "available" && latest ? (
            <div className="rounded-input border border-border bg-surface-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] text-text">
                    {t("Update available:")}{" "}
                    <span className="break-all font-mono text-xs">{latest}</span>
                  </div>
                  {applyError && <div className="mt-1 text-xs leading-relaxed text-error">{applyError}</div>}
                </div>
                <button
                  className={btnAccent()}
                  onClick={() => void apply()}
                  disabled={applying}
                >
                  {applying ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> {t("Applying…")}
                    </>
                  ) : (
                    t("Restart to update")
                  )}
                </button>
              </div>
            </div>
          ) : null
        }
      />

      <div className="mt-1 border-t border-border pt-3">
        <SettingRow
          label={t("Third-Party Licenses")}
          description={t("Open-source components bundled with Fishes and their licenses.")}
          control={
            <button
              className={btnGhost()}
              onClick={() => setLicensesOpen(true)}
              data-testid="settings-third-party-licenses"
            >
              {t("View")}
            </button>
          }
        />
      </div>

      <LicensesDialog open={licensesOpen} onClose={() => setLicensesOpen(false)} />
    </SettingsSection>
  );
}
