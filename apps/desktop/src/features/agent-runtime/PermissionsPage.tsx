import { Ban, Check, History, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { PermissionReply } from "@fishes/sdk";
import { useT } from "@/lib/i18n";
import { type PendingGroup, usePermissions } from "@/features/agent-runtime/usePermissions";
import type { PermissionDecision } from "@/features/agent-runtime/permissionLog";

/**
 * Permissions review. Fishes asks for approval at runtime (manual-approval
 * mode); this screen is where those requests are reviewed and answered, and
 * where the decisions made here are audited.
 *
 * Everything shown is real: pending requests come from the OpenCode runtime
 * (live events + recovery on open), answers go through the store's
 * `replyPermission`. OpenCode persists an "always" choice as a server-side rule
 * but exposes no API to list or revoke those standing rules individually — so
 * this page does not invent a grants list; it manages what the backend really
 * exposes and states the limit plainly.
 */
export function PermissionsPage() {
  const t = useT();
  const { pending, decisions, answer, clearLog, approvalMode, connected } = usePermissions();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 pb-16 pt-10">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          {t("Permissions")}
        </div>
        <h1 className="mt-2 font-serif text-[22px] leading-tight text-text">
          {t("Permissions")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t(
            "Fishes asks before it runs commands, edits or deletes files, installs dependencies, or connects out. Review and answer those requests here.",
          )}
        </p>

        <ApprovalModeCard mode={approvalMode} />

        {/* Pending requests — the live, answerable surface. */}
        <Section title={t("Pending requests")} icon={<ShieldQuestion size={15} />}>
          {!connected ? (
            <Empty>{t("Connect the runtime to see and answer permission requests.")}</Empty>
          ) : pending.length === 0 ? (
            <Empty>
              {approvalMode === "full"
                ? t("Nothing to review — full access is on, so in-workspace actions run without asking.")
                : t("No pending requests. When the agent needs approval, it appears here and above the chat.")}
            </Empty>
          ) : (
            <div className="divide-y divide-faint">
              {pending.map((g) => (
                <PendingRow key={g.key} group={g} onAnswer={answer} t={t} />
              ))}
            </div>
          )}
        </Section>

        {/* Session audit trail of decisions taken here. */}
        <Section
          title={`${t("Decisions this session")} (${decisions.length})`}
          icon={<History size={15} />}
          action={
            decisions.length > 0 ? (
              <button
                className="rounded-input px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
                onClick={clearLog}
              >
                {t("Clear")}
              </button>
            ) : undefined
          }
        >
          {decisions.length === 0 ? (
            <Empty>{t("Decisions you make here are listed for review. Cleared when the app restarts.")}</Empty>
          ) : (
            <div className="divide-y divide-faint">
              {decisions.map((d) => (
                <DecisionRow key={d.id} decision={d} t={t} />
              ))}
            </div>
          )}
        </Section>

        {/* Honest scope note — do not imply a capability the backend lacks. */}
        <p className="mt-6 rounded-card border border-border bg-surface px-5 py-4 text-xs leading-relaxed text-muted shadow-card">
          {t(
            "Standing grants: choosing “Always allow” saves a rule inside the runtime so the same action is not asked again. The runtime does not yet expose a way to list or revoke those saved rules one by one. To clear them all, switch the approval mode back to “Approve for me” next to the chat input — that restarts the runtime with the saved rules removed.",
          )}
        </p>
      </div>
    </div>
  );
}

function ApprovalModeCard({ mode }: { mode: "approve" | "full" }) {
  const t = useT();
  const full = mode === "full";
  return (
    <div className="mt-6 flex items-start gap-3 rounded-card border border-border bg-surface px-5 py-4 shadow-card">
      {full ? (
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />
      ) : (
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
      )}
      <div className="min-w-0">
        <div className="text-[15px] text-text">
          {full ? t("Approval mode: Full access") : t("Approval mode: Approve for me")}
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">
          {full
            ? t("In-workspace actions run without asking. Switch back next to the chat input to be prompted again.")
            : t("Risky actions pause for your approval. This is the default and can be changed next to the chat input.")}
        </div>
      </div>
    </div>
  );
}

function PendingRow({
  group,
  onAnswer,
  t,
}: {
  group: PendingGroup;
  onAnswer: (g: PendingGroup, reply: PermissionReply) => void | Promise<void>;
  t: (s: string) => string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2">
        <ShieldQuestion size={15} className="shrink-0 text-warn" />
        <span className="text-sm font-medium text-text">
          {t("Requesting")} <span className="font-mono">{group.action.replace(/[_-]+/g, " ")}</span>
        </span>
        {group.count > 1 && (
          <span className="rounded-input bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
            ×{group.count}
          </span>
        )}
      </div>
      {group.resources.length > 0 && (
        <pre className="mt-2.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-input border border-border bg-surface-2 px-3 py-2 font-mono text-[12px] text-text">
          {group.resources.join("\n")}
        </pre>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded-input px-3 py-1.5 text-xs text-error hover:bg-error/10"
          onClick={() => void onAnswer(group, "reject")}
        >
          {t("Reject")}
        </button>
        <div className="flex-1" />
        <button
          className="rounded-input border border-border px-3 py-1.5 text-xs text-text hover:bg-surface-2"
          onClick={() => void onAnswer(group, "always")}
        >
          {t("Always allow")}
        </button>
        <button
          className="rounded-input bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
          onClick={() => void onAnswer(group, "once")}
        >
          {t("Allow once")}
        </button>
      </div>
    </div>
  );
}

function DecisionRow({ decision, t }: { decision: PermissionDecision; t: (s: string) => string }) {
  const rejected = decision.reply === "reject";
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      {rejected ? (
        <Ban size={15} className="mt-0.5 shrink-0 text-error" />
      ) : (
        <Check size={15} className="mt-0.5 shrink-0 text-ok" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] text-text">
          <span className="font-medium">{replyLabel(decision.reply, t)}</span>{" "}
          <span className="font-mono text-[13px]">{decision.action.replace(/[_-]+/g, " ")}</span>
        </div>
        {decision.resources.length > 0 && (
          <div className="truncate font-mono text-[12px] leading-snug text-muted">
            {decision.resources.join("  ·  ")}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[12px] text-muted">{relTime(decision.at, t)}</span>
    </div>
  );
}

function replyLabel(reply: PermissionReply, t: (s: string) => string): string {
  if (reply === "reject") return t("Rejected");
  if (reply === "always") return t("Always allowed");
  return t("Allowed once");
}

function relTime(at: number, t: (s: string) => string): string {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (secs < 60) return t("just now");
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}${t("m ago")}`;
  const hrs = Math.round(mins / 60);
  return `${hrs}${t("h ago")}`;
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="shrink-0 text-muted">{icon}</span>
        <h2 className="font-serif text-[15px] text-text">{title}</h2>
        <div className="flex-1" />
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6 text-center text-sm text-muted">{children}</div>;
}
