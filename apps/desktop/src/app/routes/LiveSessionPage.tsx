import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FolderOpen, Loader2, NotebookPen, PanelLeft, PlugZap } from "lucide-react";
import { DRAFT_KEY, rootSessionOf, subagentActivity, useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { isTauri } from "@/lib/tauri";
import { fileInspectorFromBlock, turnDeliverable } from "@/lib/artifacts";
import { mmss, useElapsed } from "@/lib/useElapsed";
import { useScrollMemory } from "@/lib/scrollMemory";
import { useStickToBottom } from "@/lib/stickToBottom";
import { BlockList, type BlockHandlers } from "@/components/thread/BlockList";
import { Composer } from "@/components/thread/Composer";
import { baseName } from "@/components/thread/WorkspaceChip";
import { ResearchStateChip } from "@/components/thread/ResearchStateChip";
import { WorkflowStarters } from "@/components/thread/WorkflowStarters";
import { InteractionPrompt } from "@/components/thread/InteractionPrompt";
import { InspectorShell } from "@/components/inspector/InspectorShell";
import { MaximizePaneButton, RightPane } from "@/components/inspector/RightPane";
import { SessionFilesPane } from "./FilesPage";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/** Live agent session backed by the OpenCode runtime. `/live` (no id) is a blank draft;
 *  the session is created lazily on the first message, then the URL updates to /live/:id. */
export function LiveSessionPage() {
  const t = useT();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const {
    status,
    switching,
    sending,
    runningSessions,
    serverUrl,
    sessions,
    currentId,
    threads,
    error,
    questions,
    permissions,
    sessionParents,
    workspace,
    panes,
    commands,
    connect,
    openSession,
    startDraft,
    sendPrompt,
    runShell,
    runCommand,
    openArtifact,
    closeArtifact,
    setShowFiles,
    answerQuestion,
    rejectQuestion,
    replyPermission,
    interrupt,
    reconcileRunning,
    approvalMode,
    setApprovalMode,
  } = useRuntimeStore();

  // A deliberate workspace move restarts the sidecar — expected and brief, so
  // the UI stays "connected" (no badge flip, no Connect button, no help card).
  // Only a real failure (retry window exhausted, switching cleared) surfaces.
  const connected = status === "ready" || switching;
  const connecting = status === "connecting" && !switching;
  const displayStatus = switching ? "ready" : status;

  useEffect(() => {
    if (sessionId) void openSession(sessionId);
    else startDraft(); // blank draft — no session created yet (#3)
  }, [sessionId, openSession, startDraft]);

  // All three composer paths reflect a freshly-created session in the URL.
  const afterTurn = (id: string | null) => {
    if (id && !sessionId) navigate(`/live/${id}`);
  };
  const onSend = async (text: string) => afterTurn(await sendPrompt(text));
  const onRunShell = async (command: string) => afterTurn(await runShell(command));
  const onRunCommand = async (name: string, args: string) => afterTurn(await runCommand(name, args));

  // Interactions from the thread/inspector fold back into the conversation as follow-up prompts.
  const handlers: BlockHandlers = {
    onArtifactOpen: openArtifact,
    onFigureComment: (a, title) =>
      void sendPrompt(`On the figure ${title}, at (${a.x.toFixed(0)}%, ${a.y.toFixed(0)}%): ${a.note}`),
    // Subagent events fold into their own thread; a running task row reads
    // its child's latest step from there, and expands into the whole thread.
    subagentActivity: (childId) => subagentActivity(threads[childId]?.blocks),
    subagentThread: (childId) => threads[childId]?.blocks,
  };
  const onEvaluate = (expr: string) => void sendPrompt(`Evaluate in the notebook kernel:\n\`\`\`python\n${expr}\n\`\`\``);

  // A draft shows its local thread (the first message echoes there instantly,
  // before any session exists) — it is grafted onto the session id on create.
  const thread = currentId ? threads[currentId] : threads[DRAFT_KEY];
  // Opening a session fetches its history (cross-folder opens also restart the
  // sidecar) — show skeleton shapes meanwhile, never a blank page.
  const historyLoading = connected && !!sessionId && !thread?.loaded;
  const title = sessions.find((s) => s.id === currentId)?.title;
  const isEmpty = !thread || thread.blocks.length === 0;
  // The turn lifecycle: `sending` covers click → POST accepted (incl. the
  // dated-folder setup on a first message); `running` covers the agent
  // working until session.idle. Together they lock the composer and show the
  // working indicator, so a sent message is never silently "nowhere".
  const running = !!(currentId && runningSessions[currentId]);
  const working = sending || running;
  // Elapsed time on the current turn, so a long run reads as alive with a
  // ticking clock — the way Claude Code shows time next to its working spinner.
  const turnElapsed = useElapsed(working);
  // What the agent is doing right now — the newest still-running tool call.
  const currentTool = working
    ? [...(thread?.blocks ?? [])]
        .reverse()
        .find((b): b is Extract<typeof b, { kind: "tool-call" }> =>
          b.kind === "tool-call" && b.status === "running",
        )
    : undefined;

  // Esc interrupts the whole working stretch (like a terminal agent) — the
  // running turn AND the pre-session setup ("Starting the session…"), which
  // interrupt() cancels locally. Modals own Esc while open; the composer's
  // palette marks its Esc as handled.
  useEffect(() => {
    if (!working) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      void interrupt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [working, interrupt]);

  // Backstop while "Working…": if session.idle got lost (SSE reconnect
  // windows), a slow poll re-checks the server so the spinner can never
  // outlive the turn.
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => void reconcileRunning(), 15_000);
    return () => window.clearInterval(t);
  }, [running, reconcileRunning]);

  // The oldest unanswered request blocks the run — surface it. Requests from
  // subagents carry their CHILD session id; resolve through the parent chain
  // so they still land in the conversation the user is looking at.
  const belongsHere = (sid: string) =>
    !!currentId && (sid === currentId || rootSessionOf(sessionParents, sid) === currentId);
  const activeQuestion = questions.find((q) => belongsHere(q.sessionId));
  const activePermission = permissions.find((p) => belongsHere(p.sessionId));
  const activeRequest = activeQuestion ?? activePermission;
  // Name the subagent on the card when the ask isn't from the main agent.
  const requestOrigin =
    activeRequest && activeRequest.sessionId !== currentId
      ? (sessions.find((s) => s.id === activeRequest.sessionId)?.title ?? "a subagent")
      : undefined;

  // Notebooks the agent touched in THIS session — the conversation ↔ notebook map.
  const sessionNotebooks = (thread?.blocks ?? []).filter(
    (b): b is Extract<typeof b, { kind: "artifact" }> =>
      b.kind === "artifact" && b.filename.endsWith(".ipynb"),
  );
  const uniqueNotebooks = [...new Map(sessionNotebooks.map((b) => [b.path, b])).values()];

  // The right pane belongs to the session: each one remembers its own open
  // artifact or Files browser (mutually exclusive, enforced by the store) and
  // gets it back when the user returns.
  const pane = panes[currentId ?? DRAFT_KEY];
  const activeArtifact = pane?.artifact ?? null;
  const showFiles = !activeArtifact && !!pane?.showFiles;

  // Conversation scroll: remember the offset per session, AND follow the bottom
  // as a reply streams in (unless the user scrolled up to read). Same key so the
  // two coordinate — memory restores on a session switch, stick-to-bottom only
  // follows same-session growth. Both handlers run on every scroll event.
  const chatRef = useRef<HTMLDivElement>(null);
  const scrollKey = `chat:${currentId ?? DRAFT_KEY}`;
  const onChatScroll = useScrollMemory(chatRef, scrollKey, !historyLoading);
  const onStick = useStickToBottom(chatRef, scrollKey, thread?.blocks, !historyLoading);

  // When the agent starts working a notebook (Jupyter MCP), open it beside the
  // chat automatically — once per notebook, so a manual close stays closed.
  const autoOpened = useRef(new Set<string>());
  useEffect(() => {
    const agentNb = uniqueNotebooks.find(
      (b) => b.tool.toLowerCase().includes("jupyter") && !autoOpened.current.has(b.path),
    );
    if (agentNb) {
      autoOpened.current.add(agentNb.path);
      openArtifact(agentNb);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueNotebooks.length]);

  // A turn that delivers a result presents it by itself: when the run
  // finishes, the most decisive file it wrote or announced (.qcode/.qreg,
  // else a figure, else a table) opens beside the chat — the same move as
  // clicking its chip, just automatic. The tick keys the inspector so an
  // updated file is re-read, never stale.
  const wasWorking = useRef(false);
  const [deliveryTick, setDeliveryTick] = useState(0);
  useEffect(() => {
    const finished = wasWorking.current && !working;
    wasWorking.current = working;
    if (!finished) return;
    const deliverable = turnDeliverable(thread?.blocks ?? []);
    if (deliverable) {
      openArtifact(deliverable);
      setDeliveryTick((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working]);

  // With the sidebar collapsed this header doubles as the titlebar (macOS
  // overlay): it clears the traffic lights, hosts the sidebar expand button,
  // and empty stretches drag the window — one row, never two.
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const isMac = navigator.userAgent.includes("Mac");
  const overlayTitlebar = isTauri && isMac;

  return (
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div
          data-tauri-drag-region={overlayTitlebar || undefined}
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 px-6",
            // A draft is a clean page — no separator; an open session gets a
            // faint one so the title row reads as part of the conversation.
            sessionId && "border-b border-faint",
            sidebarCollapsed && overlayTitlebar && "pl-[78px]",
          )}
        >
          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              aria-label={t("Expand sidebar")}
              title={`${t("Expand sidebar")} (${isMac ? "⌘B" : "Ctrl+B"})`}
              className="fade-in rounded p-1 text-text hover:bg-surface-2"
            >
              <PanelLeft size={14} strokeWidth={1.5} />
            </button>
          )}
          {/* A draft has no session folder yet, so no Files toggle until the
              first message creates the session. */}
          {sessionId && (
            <button
              onClick={() => setShowFiles(!showFiles)}
              className={cn(
                "flex items-center gap-1 rounded-input px-2 py-0.5 text-xs ring-1 ring-border hover:bg-surface-2",
                showFiles ? "bg-surface-2 text-text" : "bg-surface text-muted",
              )}
              title={`${t("Browse this session's folder beside the chat")}${workspace ? ` — ${workspace}` : ""}`}
              aria-pressed={showFiles}
            >
              <FolderOpen size={12} />
              {/* An open session's folder is a fact — the toggle names it, replacing
                  a separate folder chip (one element for "this session's files"). */}
              <span className="max-w-[160px] truncate">
                {workspace ? baseName(workspace) : t("Files")}
              </span>
            </button>
          )}
          {/* A draft shows no title and no folder — the workspace picker lives
              in the composer's action row until the session exists. */}
          {sessionId && (
            <h1 className="truncate text-[13px] font-medium text-text">{title ?? ""}</h1>
          )}
          {/* Navigator projects keep their standing in view: phase + decisions
              waiting on the researcher, re-read when a turn completes. */}
          {sessionId && isTauri && (
            <ResearchStateChip
              refreshKey={`${currentId ?? ""}:${workspace ?? ""}:${working ? "run" : "idle"}`}
              onOpen={openArtifact}
            />
          )}
          <div data-tauri-drag-region={overlayTitlebar || undefined} className="flex-1" />
          <ConnBadge status={displayStatus} />
          {uniqueNotebooks.map((nb) => (
            <button
              key={nb.path}
              onClick={() => openArtifact(nb)}
              className={cn(
                "flex items-center gap-1 rounded-input px-2 py-0.5 font-mono text-xs ring-1 ring-border hover:bg-surface-2",
                activeArtifact?.path === nb.path ? "bg-surface-2 text-text" : "bg-surface text-muted",
              )}
              title={`${t("Open")} ${nb.path} — ${t("the agent works on this notebook in this session")}`}
            >
              <NotebookPen size={11} />
              <span className="max-w-[180px] truncate">{nb.filename}</span>
            </button>
          ))}
          {!connected && (
            <button
              onClick={connect}
              disabled={connecting}
              className="flex items-center gap-1.5 rounded-input bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {connecting ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
              {t("Connect")}
            </button>
          )}
        </div>

        <div
          ref={chatRef}
          onScroll={(e) => {
            onChatScroll(e);
            onStick(e);
          }}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-8 py-6">
            {/* Deliberate workspace switches don't render anything at all (they're
                masked as connected); a genuine boot/reconnect shows only the
                header badge's pulsing dot — anything appearing and disappearing
                in the content flow makes the page jump. The help card is for
                real error/offline states. */}
            {!connected && !connecting && (
              <div className="rounded-card border border-border bg-surface p-5 shadow-card">
                <div className="text-sm font-medium text-text">{t("OpenCode runtime")}</div>
                <p className="mt-1 text-sm text-muted">
                  {t(
                    "The desktop app runs a bundled OpenCode automatically. In the browser, start one with",
                  )}{" "}
                  <span className="font-mono">opencode serve</span> {t("and connect.")}
                </p>
                <div className="mt-3 rounded-input bg-surface-2 px-3 py-2 font-mono text-xs text-text">
                  {serverUrl}
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-input border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}
            {connected && isEmpty && !sessionId && (
              <WorkflowStarters onPick={(p) => void onSend(p)} />
            )}
            {historyLoading && <ThreadSkeleton />}
            {!historyLoading && thread && <BlockList blocks={thread.blocks} handlers={handlers} />}
            {working && (
              // Typing-indicator at the bottom of the conversation: the message
              // just echoed above it, so the user always sees the send is alive.
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
                <Loader2 size={14} className="shrink-0 animate-spin" />
                {/* The status verb shimmers while genuinely working (paused-on-a-
                    question stays static — nothing is running then). */}
                <span className={cn("shrink-0", !activeRequest && "shimmer-text")}>
                  {activeRequest
                    ? t("Paused — the agent needs your answer below")
                    : sending && !currentId
                      ? t("Starting the session in its folder…")
                      : t("Working…")}
                </span>
                {/* The live activity verb — what it's doing right now, from the
                    newest running tool — reads better than a random word. */}
                {!activeRequest && currentTool && (
                  <span
                    className="shimmer-text min-w-0 truncate font-mono text-xs"
                    title={currentTool.title}
                  >
                    {currentTool.title}
                  </span>
                )}
                {/* Elapsed clock + interrupt hint, like Claude Code's status
                    line: proof it's alive, and how to stop it. */}
                {!activeRequest && (
                  <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted/70 tabular-nums">
                    <span>{mmss(turnElapsed)}</span>
                    <span className="hidden text-muted/50 sm:inline">·</span>
                    <span className="hidden sm:inline">{t("Esc to interrupt")}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-8 pb-5 pt-2">
          <div className="mx-auto max-w-[760px] space-y-3">
            {activeRequest && (
              <InteractionPrompt
                question={activeQuestion}
                permission={activeQuestion ? undefined : activePermission}
                origin={requestOrigin}
                onAnswer={(id, answers) => void answerQuestion(id, answers)}
                onReject={(id) => void rejectQuestion(id)}
                onPermission={(id, reply) => void replyPermission(id, reply)}
              />
            )}
            <Composer
              onSend={onSend}
              onRunShell={(c) => void onRunShell(c)}
              onRunCommand={(n, a) => void onRunCommand(n, a)}
              commands={commands}
              disabled={!connected || working}
              working={running}
              onStop={() => void interrupt()}
              placeholder={
                working ? t("Waiting for the reply…") : connected ? t("Ask anything") : t("Connect to chat")
              }
              approvalMode={approvalMode}
              onApprovalModeChange={(mode) => void setApprovalMode(mode)}
            />
          </div>
        </div>
      </div>

      {(activeArtifact || showFiles) && (
        <RightPane onClose={activeArtifact ? closeArtifact : () => setShowFiles(false)}>
          {activeArtifact ? (
            <InspectorShell
              key={deliveryTick}
              inspector={fileInspectorFromBlock(activeArtifact)}
              onClose={closeArtifact}
              onEvaluate={onEvaluate}
              controls={<MaximizePaneButton />}
            />
          ) : (
            <div className="h-full border-l border-border bg-surface">
              <SessionFilesPane
                onClose={() => setShowFiles(false)}
                controls={<MaximizePaneButton />}
              />
            </div>
          )}
        </RightPane>
      )}
    </div>
  );
}

/** Loading placeholder mirroring the thread's real shapes: a user card, agent
 *  text lines, a quiet tool row — so the page never sits blank while history
 *  loads and nothing jumps when the content arrives. */
function ThreadSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-11 rounded-card bg-surface-2" />
      <div className="space-y-2.5 px-1 pt-1">
        <div className="h-3.5 w-11/12 rounded bg-surface-2" />
        <div className="h-3.5 w-4/5 rounded bg-surface-2" />
        <div className="h-3.5 w-2/3 rounded bg-surface-2" />
      </div>
      <div className="ml-2 h-4 w-2/5 rounded bg-surface-2 opacity-60" />
      <div className="h-11 rounded-card bg-surface-2" />
      <div className="space-y-2.5 px-1 pt-1">
        <div className="h-3.5 w-5/6 rounded bg-surface-2" />
        <div className="h-3.5 w-3/5 rounded bg-surface-2" />
      </div>
    </div>
  );
}

function ConnBadge({ status }: { status: string }) {
  const tone = status === "ready" ? "text-ok" : status === "error" ? "text-error" : "text-muted";
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", tone)} title={`OpenCode · ${status}`}>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "ready" ? "bg-ok" : status === "error" ? "bg-error" : "bg-muted",
          status === "connecting" && "animate-pulse",
        )}
      />
      {/* Ready is the norm — a green dot says it all (hover for detail). Text
          appears only for states that need attention. */}
      {status !== "ready" && <>OpenCode · {status}</>}
    </span>
  );
}
