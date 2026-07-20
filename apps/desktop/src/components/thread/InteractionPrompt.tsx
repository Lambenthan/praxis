import { useState } from "react";
import { Check, HelpCircle, ShieldQuestion } from "lucide-react";
import type { PermissionAskedEvent, PermissionReply, QuestionAskedEvent } from "@fishes/sdk";
import { useRuntimeStore } from "@/lib/runtime";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/**
 * The answerable surface for an agent request that blocks the run — a
 * `question` (pick options) or a `permission` (approve an action). Without
 * this, the agent's `question`/`permission` tool sits forever and the session
 * looks stuck. Rendered just above the composer for the current session.
 */
export function InteractionPrompt({
  question,
  permission,
  origin,
  onAnswer,
  onReject,
  onPermission,
}: {
  question?: QuestionAskedEvent;
  permission?: PermissionAskedEvent;
  /** Who is asking, when it isn't the main agent — a subagent session's title. */
  origin?: string;
  onAnswer: (requestId: string, answers: string[][]) => void;
  onReject: (requestId: string) => void;
  onPermission: (requestId: string, reply: PermissionReply) => void;
}) {
  if (question) {
    return (
      <QuestionCard
        key={question.requestId}
        question={question}
        origin={origin}
        onAnswer={onAnswer}
        onReject={onReject}
      />
    );
  }
  if (permission) {
    return (
      <PermissionCard
        key={permission.requestId}
        permission={permission}
        origin={origin}
        onReply={onPermission}
      />
    );
  }
  return null;
}

/** "external_directory" → "external directory" — readable, still explicit. */
const actionLabel = (action: string) => action.replace(/[_-]+/g, " ");

function QuestionCard({
  question,
  origin,
  onAnswer,
  onReject,
}: {
  question: QuestionAskedEvent;
  origin?: string;
  onAnswer: (requestId: string, answers: string[][]) => void;
  onReject: (requestId: string) => void;
}) {
  const t = useT();
  // One selection set + one custom string per question.
  const [selected, setSelected] = useState<Record<number, Set<string>>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});

  const items = question.questions;
  const toggle = (qi: number, label: string, multiple: boolean) =>
    setSelected((s) => {
      const cur = new Set(multiple ? (s[qi] ?? []) : []);
      if (cur.has(label)) cur.delete(label);
      else cur.add(label);
      return { ...s, [qi]: cur };
    });

  const answerFor = (qi: number): string[] => {
    const picked = [...(selected[qi] ?? [])];
    const c = custom[qi]?.trim();
    return c ? [...picked, c] : picked;
  };
  const ready = items.every((_, qi) => answerFor(qi).length > 0);
  const submit = () => onAnswer(question.requestId, items.map((_, qi) => answerFor(qi)));

  // Single question, single-select: clicking an option answers at once (the
  // quick path). The always-present free-text box still lets the user type
  // their own view instead — Enter submits it.
  const isQuickPick = items.length === 1 && !items[0].multiple;

  return (
    <div className="rounded-card border border-accent/40 bg-surface shadow-card">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <HelpCircle size={15} className="text-accent" />
          <span className="text-sm font-medium text-text">{t("The agent needs your input")}</span>
          <button
            className="ml-auto text-xs text-muted hover:text-text"
            onClick={() => onReject(question.requestId)}
          >
            {t("Skip")}
          </button>
        </div>
        {origin && (
          <div className="mt-0.5 pl-6 text-xs text-muted">
            {t("Asked by")} {origin}
          </div>
        )}
      </header>

      <div className="space-y-4 px-4 py-3.5">
        {items.map((it, qi) => {
          const multiple = !!it.multiple;
          return (
            <div key={qi} className="space-y-2">
              <div className="text-sm text-text">{it.question}</div>
              <div className="flex flex-col gap-1.5">
                {it.options.map((opt) => {
                  const on = selected[qi]?.has(opt.label) ?? false;
                  const act = () =>
                    isQuickPick
                      ? onAnswer(question.requestId, [[opt.label]])
                      : toggle(qi, opt.label, multiple);
                  return (
                    <button
                      key={opt.label}
                      onClick={act}
                      className={cn(
                        "flex items-start gap-2.5 rounded-input border px-3 py-2 text-left transition-colors",
                        on
                          ? "border-accent bg-accent/10"
                          : "border-border bg-surface hover:bg-surface-2",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                          on ? "border-accent bg-accent text-accent-fg" : "border-muted/50",
                        )}
                      >
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-text">{opt.label}</span>
                        {opt.description && (
                          <span className="mt-0.5 block text-xs leading-snug text-muted">
                            {opt.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Always available: type a view of your own instead of picking
                  an option. Enter submits once every question has an answer. */}
              <input
                value={custom[qi] ?? ""}
                onChange={(e) => setCustom((c) => ({ ...c, [qi]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && ready) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={t("Or type your own answer… (Enter to send)")}
                className="w-full rounded-input border border-border bg-surface px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent/60"
              />
            </div>
          );
        })}
      </div>

      {!isQuickPick && (
        <footer className="flex justify-end gap-2 border-t border-border px-4 py-2.5">
          <button
            className="rounded-input px-3 py-1.5 text-xs text-muted hover:text-text"
            onClick={() => onReject(question.requestId)}
          >
            {t("Skip")}
          </button>
          <button
            disabled={!ready}
            onClick={() => onAnswer(question.requestId, items.map((_, qi) => answerFor(qi)))}
            className="rounded-input bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {t("Submit")}
          </button>
        </footer>
      )}
    </div>
  );
}

function PermissionCard({
  permission,
  origin,
  onReply,
}: {
  permission: PermissionAskedEvent;
  origin?: string;
  onReply: (requestId: string, reply: PermissionReply) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-card border border-warn/40 bg-surface shadow-card">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldQuestion size={15} className="text-warn" />
          <span className="text-sm font-medium text-text">
            {t("The agent asks permission:")} <span className="font-mono">{actionLabel(permission.action)}</span>
          </span>
        </div>
        {origin && (
          <div className="mt-0.5 pl-6 text-xs text-muted">
            {t("Asked by")} {origin}
          </div>
        )}
      </header>
      {permission.resources.length > 0 && (
        <div className="px-4 py-3">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-input border border-border bg-surface-2 px-3 py-2 font-mono text-[12px] text-text">
            {permission.resources.join("\n")}
          </pre>
        </div>
      )}
      <footer className="flex items-center gap-2 border-t border-border px-4 py-2.5">
        <button
          className="rounded-input px-3 py-1.5 text-xs text-error hover:bg-error/10"
          onClick={() => onReply(permission.requestId, "reject")}
        >
          {t("Reject")}
        </button>
        <div className="flex-1" />
        <button
          className="rounded-input border border-border px-3 py-1.5 text-xs text-text hover:bg-surface-2"
          onClick={() => onReply(permission.requestId, "always")}
        >
          {t("Always allow")}
        </button>
        <button
          className="rounded-input bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
          onClick={() => onReply(permission.requestId, "once")}
        >
          {t("Allow once")}
        </button>
      </footer>
      {/* The informed moment to offer full access is right here — the user is
          living the trade-off. Approves this request AND flips the mode, so
          this is the last prompt they see. Default mode stays "approve";
          switching back lives next to the composer. */}
      <div className="border-t border-border px-4 py-2 text-xs text-muted">
        {t("Don't want to confirm each time?")}{" "}
        <button
          className="text-accent hover:underline"
          onClick={() => {
            onReply(permission.requestId, "once");
            void useRuntimeStore.getState().setApprovalMode("full");
          }}
        >
          {t("Switch to full access")}
        </button>{" "}
        {t("— later actions run without asking. You can switch back next to the input box.")}
      </div>
    </div>
  );
}
