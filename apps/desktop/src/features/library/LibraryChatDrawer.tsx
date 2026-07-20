import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Folder, History, Loader2, MessageSquare, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { BlockList } from "@/components/thread/BlockList";
import { Composer } from "@/components/thread/Composer";
import { InteractionPrompt } from "@/components/thread/InteractionPrompt";
import { DRAFT_KEY, rootSessionOf, useRuntimeStore } from "@/lib/runtime";
import type { ArtifactBlock } from "@fishes/shared";
import { useStickToBottom } from "@/lib/stickToBottom";
import { baseName } from "@/components/thread/WorkspaceChip";
import { useT } from "@/lib/i18n";
import { ResizeEdge, useStoredWidth } from "./ResizeEdge";


/**
 * The library's docked conversation: the SAME live session surface as /live
 * (same store, same session — nothing forks), rendered beside the library so
 * organizing references and talking to the assistant happen in one place.
 * "Ingest into wiki" opens this instead of navigating away.
 *
 * Filing model: a conversation belongs to the OPEN project (its workspace
 * folder); "+" always starts a fresh conversation in that project.
 */
export function LibraryChatDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const currentId = useRuntimeStore((s) => s.currentId);
  // Narrow to the CURRENT thread and its running flag — subscribing to the
  // whole `threads`/`runningSessions` objects repainted the drawer on every
  // SSE event of every session (subagent batches included).
  const thread = useRuntimeStore((s) => s.threads[s.currentId ?? DRAFT_KEY]);
  const running = useRuntimeStore((s) => !!(s.currentId && s.runningSessions[s.currentId]));
  const sending = useRuntimeStore((s) => s.sending);
  const status = useRuntimeStore((s) => s.status);
  const sessions = useRuntimeStore((s) => s.sessions);
  const sessionParents = useRuntimeStore((s) => s.sessionParents);
  const questions = useRuntimeStore((s) => s.questions);
  const permissions = useRuntimeStore((s) => s.permissions);
  const commands = useRuntimeStore((s) => s.commands);
  const sendPrompt = useRuntimeStore((s) => s.sendPrompt);
  const runShell = useRuntimeStore((s) => s.runShell);
  const runCommand = useRuntimeStore((s) => s.runCommand);
  const interrupt = useRuntimeStore((s) => s.interrupt);
  const openSession = useRuntimeStore((s) => s.openSession);
  const startDraft = useRuntimeStore((s) => s.startDraft);
  const answerQuestion = useRuntimeStore((s) => s.answerQuestion);
  const rejectQuestion = useRuntimeStore((s) => s.rejectQuestion);
  const replyPermission = useRuntimeStore((s) => s.replyPermission);

  const working = sending || running;
  const connected = status === "ready";
  const title = sessions.find((s) => s.id === currentId)?.title;

  // Project-centric: the drawer talks in the CURRENT project (workspace). Its
  // conversations are the sessions whose folder IS the open project.
  const workspace = useRuntimeStore((s) => s.workspace);
  const scopeLabel = workspace ? baseName(workspace) : t("Blank workspace");

  /** A new conversation in the current project — you're already in its
   *  workspace, so just start a fresh draft (no switch). */
  const pinScope = () => startDraft();

  // Follow the open project: surface its latest conversation, else a draft.
  // NEVER while a send is in flight — a flow like "Generate wiki" starts a
  // deliberate fresh draft and this effect re-opening the previous session
  // would land the prompt in the OLD conversation (user-reported).
  const sessionsLoaded = sessions.length > 0;
  useEffect(() => {
    const rt = useRuntimeStore.getState();
    if (rt.sending || (rt.currentId && rt.runningSessions[rt.currentId])) return;
    const target = sessions.find((s) => s.directory === workspace);
    if (target) {
      if (currentId !== target.id) void openSession(target.id);
    } else {
      startDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- realign only when the project (or first session load) changes
  }, [workspace, sessionsLoaded]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!historyOpen) return;
    const close = (e: MouseEvent) => {
      if (!historyRef.current?.contains(e.target as Node)) setHistoryOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [historyOpen]);
  // VS Code model: history belongs to the OPEN folder — the popup lists ONLY
  // the current project's conversations, nothing from other projects, nothing
  // unfiled.
  // Subagent child sessions (ingest batches etc.) are INTERNALS of their
  // parent conversation — same rule as the sidebar: no row of their own.
  const projectSessions = useMemo(
    () => sessions.filter((s) => !s.parentId && !!workspace && s.directory === workspace),
    [sessions, workspace],
  );

  // Artifact chips (log.md, tables…) must be openable here too — open the
  // inspector pane in the full view, where there is room. Memoized: an inline
  // object would defeat BlockList's memo on every streamed token.
  const handlers = useMemo(
    () => ({
      onArtifactOpen: (a: ArtifactBlock) => {
        const rt = useRuntimeStore.getState();
        rt.openArtifact(a);
        navigate(rt.currentId ? `/live/${rt.currentId}` : "/live");
      },
    }),
    [navigate],
  );

  // A session opened elsewhere may not have its history in memory yet.
  useEffect(() => {
    if (currentId && !useRuntimeStore.getState().threads[currentId]?.loaded)
      void openSession(currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per session id
  }, [currentId]);

  // Follow the conversation like /live: land at the bottom when a conversation
  // opens or loads, then stick to it as content streams in — but only while
  // the user is already near the bottom (reading history must not be yanked
  // away). The old unconditional `scrollTop = scrollHeight` on every new block
  // both fought the user's scroll and forced a synchronous reflow per event.
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadKey = currentId ?? DRAFT_KEY;
  const loaded = !!thread?.loaded;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && loaded) el.scrollTop = el.scrollHeight;
  }, [threadKey, loaded]);
  const onStick = useStickToBottom(scrollRef, threadKey, thread?.blocks, loaded);

  // Blocking asks (questions / permission requests) from this session or its
  // subagents must be answerable HERE — otherwise an ingestion started from
  // the library would stall invisibly behind an unanswered approval.
  const belongsHere = (sid: string) =>
    !!currentId && (sid === currentId || rootSessionOf(sessionParents, sid) === currentId);
  const activeQuestion = questions.find((q) => belongsHere(q.sessionId));
  const activePermission = activeQuestion ? undefined : permissions.find((p) => belongsHere(p.sessionId));
  const activeRequest = activeQuestion ?? activePermission;
  const requestOrigin =
    activeRequest && activeRequest.sessionId !== currentId
      ? (sessions.find((s) => s.id === activeRequest.sessionId)?.title ?? t("a subagent"))
      : undefined;

  const [width, setWidth] = useStoredWidth("fishes.lib.chat.w", 400, 320, 720);
  return (
    <div
      className="relative flex shrink-0 flex-col border-l border-border bg-bg-100"
      style={{ width }}
    >
      <ResizeEdge edge="left" width={width} onResize={setWidth} />
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <MessageSquare size={14} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">
          {title ?? t("Conversation")}
        </span>
        {/* Filing badge doubles as a jump to the project's files (VS Code:
            the folder name IS the way into the folder). */}
        <button
          className="flex max-w-[45%] shrink-0 items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-bg-300 hover:text-text"
          title={t("Open this project's files")}
          onClick={() => navigate("/files")}
        >
          <Folder size={11} className="shrink-0" />
          <span className="truncate">{scopeLabel}</span>
        </button>
        <button
          className="text-muted hover:text-text"
          aria-label={t("New conversation in this scope")}
          title={t("New conversation in this scope")}
          onClick={pinScope}
        >
          <Plus size={14} />
        </button>
        <button
          className="text-muted hover:text-text"
          aria-label={t("Open in full view")}
          title={t("Open in full view")}
          onClick={() => navigate(currentId ? `/live/${currentId}` : "/live")}
        >
          <ExternalLink size={13} />
        </button>
        <button className="ml-1 text-text hover:opacity-60" aria-label={t("Close")} onClick={onClose}>
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Same thread grammar as /live (block column, 2.5 gap), narrow width. */}
      <div ref={scrollRef} onScroll={onStick} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2.5 px-4 pb-6 pt-3">
          {(!thread || thread.blocks.length === 0) && !working && (
            <div className="px-1 py-2 text-[14px] leading-relaxed text-muted">
              {t(
                "Conversations here belong to this project and can draw on all of its literature.",
              )}
            </div>
          )}
          {thread && <BlockList blocks={thread.blocks} handlers={handlers} />}
          {working && (
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="shrink-0 animate-spin" />
              <span className={cn("shrink-0", !activeRequest && "shimmer-text")}>
                {activeRequest ? t("Paused — the agent needs your answer below") : t("Working…")}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        {activeRequest && (
          <InteractionPrompt
            question={activeQuestion}
            permission={activePermission}
            origin={requestOrigin}
            onAnswer={(id, answers) => void answerQuestion(id, answers)}
            onReject={(id) => void rejectQuestion(id)}
            onPermission={(id, reply) => void replyPermission(id, reply)}
          />
        )}
        <Composer
          onSend={(text) => void sendPrompt(text)}
          onRunShell={(c) => void runShell(c)}
          onRunCommand={(n, a) => void runCommand(n, a)}
          commands={commands}
          disabled={!connected || working}
          working={running}
          onStop={() => void interrupt()}
          leadingAction={
            <div ref={historyRef} className="relative">
              <button
                aria-label={t("Session history")}
                title={t("Session history")}
                className="flex h-8 w-8 items-center justify-center rounded-input text-text-300 hover:bg-bg-200 hover:text-text-100"
                onClick={() => setHistoryOpen((o) => !o)}
              >
                <History size={16} />
              </button>
              {historyOpen && (
                <div className="absolute bottom-full left-0 z-30 mb-2 max-h-80 w-72 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-pop">
                  <HistoryGroup
                    label={scopeLabel}
                    sessions={projectSessions}
                    empty={t("No conversations in this scope yet.")}
                    currentId={currentId}
                    onPick={(id) => {
                      setHistoryOpen(false);
                      void openSession(id);
                    }}
                  />
                </div>
              )}
            </div>
          }
          placeholder={
            working
              ? t("Waiting for the reply…")
              : connected
                ? t("Ask about your library…")
                : t("Connect to chat")
          }
        />
      </div>
    </div>
  );
}

function HistoryGroup({
  label,
  sessions,
  empty,
  currentId,
  onPick,
}: {
  label: string;
  sessions: { id: string; title?: string }[];
  empty?: string;
  currentId: string | null;
  onPick: (id: string) => void;
}) {
  if (sessions.length === 0 && !empty) return null;
  return (
    <div className="mb-1">
      <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      {sessions.length === 0 && <div className="px-2 py-1 text-[12px] text-muted">{empty}</div>}
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onPick(s.id)}
          className={
            "block w-full truncate rounded px-2 py-1 text-left text-[13px] " +
            (s.id === currentId ? "bg-surface-2 text-text" : "text-text hover:bg-surface-2/60")
          }
        >
          {s.title || s.id}
        </button>
      ))}
    </div>
  );
}
