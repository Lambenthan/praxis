import { useEffect, useState } from "react";
import { Check, Hand, Loader2, Zap } from "lucide-react";
import { getApprovalMode, isTauri, setApprovalMode, type ApprovalMode } from "@/lib/tauri";
import { useRuntimeStore } from "@/lib/runtime";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { SettingsSection } from "./SettingsSection";
import { SettingRow } from "./SettingRow";

const OPTIONS: { mode: ApprovalMode; label: string; description: string; icon: typeof Hand }[] = [
  {
    mode: "approve",
    label: "Manual approval",
    description:
      "The agent asks before running commands, deleting files, installing dependencies, or connecting out. Recommended.",
    icon: Hand,
  },
  {
    mode: "full",
    label: "Full access",
    description:
      "The agent acts without asking. Faster, but it can run commands and change files on its own — only for a trusted workspace.",
    icon: Zap,
  },
];

/**
 * Permissions: how agent actions get approved. Backed by the real approval-mode
 * setting (`get_approval_mode` / `set_approval_mode`); switching it restarts the
 * sidecar, so we reconnect the runtime afterwards. The default is always manual
 * approval — Fishes never ships approvals off.
 */
export function PermissionsSection() {
  const t = useT();
  const [mode, setMode] = useState<ApprovalMode>("approve");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getApprovalMode().then(setMode);
  }, []);

  const change = async (next: ApprovalMode) => {
    if (next === mode || busy) return;
    setBusy(true);
    const prev = mode;
    setMode(next); // optimistic — reflects the choice while the sidecar restarts
    try {
      await setApprovalMode(next);
      // The sidecar restarts with the new mode — reconnect so the app follows it.
      await useRuntimeStore.getState().connectRetry();
      toast.success(
        next === "full"
          ? t("Full access enabled — the agent will act without asking.")
          : t("Manual approval enabled — the agent will ask before acting."),
      );
    } catch (e) {
      setMode(prev); // roll back the optimistic switch
      toast.error(
        `${t("Could not change the approval mode:")} ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title={t("Permissions")}
      hint={t("How agent actions get approved in this workspace.")}
    >
      {!isTauri && (
        <p className="mb-3 text-xs leading-relaxed text-muted">
          {t("Approval mode applies in the desktop app.")}
        </p>
      )}
      <SettingRow
        label={t("Approval mode")}
        description={t(
          "The agent may only touch the current workspace. This decides whether risky actions pause for your OK.",
        )}
        below={
          <div
            role="radiogroup"
            aria-label={t("Approval mode")}
            className="divide-y divide-border overflow-hidden rounded-input border border-border"
          >
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = opt.mode === mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => void change(opt.mode)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors disabled:opacity-60",
                    selected ? "bg-surface-2" : "bg-surface hover:bg-surface-2",
                  )}
                >
                  <Icon size={15} className="mt-0.5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-text">{t(opt.label)}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                      {t(opt.description)}
                    </span>
                  </span>
                  {busy && selected ? (
                    <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-muted" />
                  ) : selected ? (
                    <Check size={15} className="mt-0.5 shrink-0 text-accent" />
                  ) : null}
                </button>
              );
            })}
          </div>
        }
      />
    </SettingsSection>
  );
}
