import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, NotebookPen, PlugZap } from "lucide-react";
import { AClose, AFolder, APanel, APlay } from "@/components/icons/anthropic";
import type { ArtifactBlock } from "@fishes/shared";
import { DRAFT_KEY, rootSessionOf, subagentActivity, useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { isTauri } from "@/lib/tauri";
import { fileInspectorFromBlock, turnDeliverable } from "@/lib/artifacts";
import { mmss, useElapsed } from "@/lib/useElapsed";
import { useScrollMemory } from "@/lib/scrollMemory";
import { useStickToBottom } from "@/lib/stickToBottom";
import { BlockList, type BlockHandlers } from "@/components/thread/BlockList";
import { LastMessagePill } from "@/components/thread/LastMessagePill";
import { Composer } from "@/components/thread/Composer";
import { abbrevHome, baseName } from "@/components/thread/WorkspaceChip";
import { ResearchStateChip } from "@/components/thread/ResearchStateChip";
import { PlanChip, usePlanProgress } from "@/components/thread/PlanPanel";
import { WorkflowStarters } from "@/components/thread/WorkflowStarters";
import { StepActionsPanel, StepsMenuButton } from "@/components/thread/StepActions";
import { SessionMenuButton } from "@/components/thread/SessionMenu";
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
  // Narrow subscriptions (perf): during heavy SSE streaming — several subagent
  // sessions folding events at once — the page must re-render only when
  // something IT shows changes. The previous whole-store subscription repainted
  // the entire page on EVERY event of every session (`threads` and
  // `runningSessions` are replaced per event); now a child-session event
  // re-renders only its own task row (see SubagentRow in BlockList).
  const status = useRuntimeStore((s) => s.status);
  const switching = useRuntimeStore((s) => s.switching);
  const sending = useRuntimeStore((s) => s.sending);
  const serverUrl = useRuntimeStore((s) => s.serverUrl);
  const sessions = useRuntimeStore((s) => s.sessions);
  const currentId = useRuntimeStore((s) => s.currentId);
  const error = useRuntimeStore((s) => s.error);
  const questions = useRuntimeStore((s) => s.questions);
  const permissions = useRuntimeStore((s) => s.permissions);
  const sessionParents = useRuntimeStore((s) => s.sessionParents);
  const workspace = useRuntimeStore((s) => s.workspace);
  const commands = useRuntimeStore((s) => s.commands);
  const workspacePinned = useRuntimeStore((s) => s.workspacePinned);
  const approvalMode = useRuntimeStore((s) => s.approvalMode);
  // A draft shows its local thread (the first message echoes there instantly,
  // before any session exists) — it is grafted onto the session id on create.
  const thread = useRuntimeStore((s) => s.threads[s.currentId ?? DRAFT_KEY]);
  // The turn lifecycle: `sending` covers click → POST accepted; `running`
  // covers the agent working until session.idle (see `working` below).
  const running = useRuntimeStore((s) => !!(s.currentId && s.runningSessions[s.currentId]));
  // The right pane belongs to the session: each one remembers its own open
  // artifact or Files browser (mutually exclusive, enforced by the store).
  const pane = useRuntimeStore((s) => s.panes[s.currentId ?? DRAFT_KEY]);
  // Actions are stable for the store's lifetime — no subscription needed.
  const {
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
    setApprovalMode,
  } = useRuntimeStore.getState();

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

  // Interactions from the thread/inspector fold back into the conversation as
  // follow-up prompts. Memoized (all reads go through getState) so the
  // memoized BlockList sees the SAME handlers object across re-renders —
  // recreating it every render used to invalidate the memo on every event.
  const handlers: BlockHandlers = useMemo(
    () => ({
      onArtifactOpen: openArtifact,
      onFigureComment: (a, title) =>
        void sendPrompt(`On the figure ${title}, at (${a.x.toFixed(0)}%, ${a.y.toFixed(0)}%): ${a.note}`),
      // Subagent events fold into their own thread; a running task row reads
      // its child's latest step from there, and expands into the whole thread.
      subagentActivity: (childId) =>
        subagentActivity(useRuntimeStore.getState().threads[childId]?.blocks),
      subagentThread: (childId) => useRuntimeStore.getState().threads[childId]?.blocks,
    }),
    [openArtifact, sendPrompt],
  );
  const onEvaluate = (expr: string) => void sendPrompt(`Evaluate in the notebook kernel:\n\`\`\`python\n${expr}\n\`\`\``);

  // Opening a session fetches its history (cross-folder opens also restart the
  // sidecar) — show skeleton shapes meanwhile, never a blank page.
  const historyLoading = connected && !!sessionId && !thread?.loaded;
  const title = sessions.find((s) => s.id === currentId)?.title;
  const isEmpty = !thread || thread.blocks.length === 0;
  // `sending` and `running` together lock the composer and show the working
  // indicator, so a sent message is never silently "nowhere".
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

  // Plan-as-report progress (null when the workspace has no plan.json).
  const planProgress = usePlanProgress(
    `${currentId ?? ""}:${workspace ?? ""}:${working ? "run" : "idle"}`,
    working,
  );

  // The composer info bar's step chip: tool steps taken in the LATEST turn
  // (everything after the last user message) — a real count, not a fabricated
  // "N of N".
  const lastTurnSteps = (() => {
    const blocks = thread?.blocks ?? [];
    let start = 0;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].kind === "user") {
        start = i + 1;
        break;
      }
    }
    return blocks.slice(start).filter((b) => b.kind === "tool-call").length;
  })();

  // Handoff §2 interrupted banner: the last turn was stopped and the session is
  // now idle. Fishes records the stop as a trailing "Interrupted" status-line;
  // key the banner off that real signal. "Resume" re-sends the last user prompt
  // (OpenCode can't continue an aborted turn, so resuming means retrying it).
  const lastBlock = thread?.blocks[thread.blocks.length - 1];
  const wasInterrupted =
    !working &&
    lastBlock?.kind === "status-line" &&
    lastBlock.tone === "error" &&
    /Interrupted|中断/i.test(lastBlock.text);
  const lastUserPrompt = [...(thread?.blocks ?? [])]
    .reverse()
    .find((b): b is Extract<typeof b, { kind: "user" }> => b.kind === "user")?.text;

  const activeArtifact = pane?.artifact ?? null;
  const showFiles = !activeArtifact && !!pane?.showFiles;

  // Conversation scroll: remember the offset per session, AND follow the bottom
  // as a reply streams in (unless the user scrolled up to read). Same key so the
  // two coordinate — memory restores on a session switch, stick-to-bottom only
  // follows same-session growth. Both handlers run on every scroll event.
  const chatRef = useRef<HTMLDivElement | null>(null);
  // State mirror of chatRef so the last-message pill re-renders when the
  // scroll container mounts.
  const [chatEl, setChatEl] = useState<HTMLDivElement | null>(null);
  // The right pane's tab strip: every artifact opened in this session stays
  // reachable as a tab (deduped by path); a session switch starts clean.
  const [paneTabs, setPaneTabs] = useState<ArtifactBlock[]>([]);
  useEffect(() => {
    if (!activeArtifact) return;
    setPaneTabs((tabs) =>
      tabs.some((b) => b.path === activeArtifact.path) ? tabs : [...tabs, activeArtifact],
    );
  }, [activeArtifact]);
  useEffect(() => {
    setPaneTabs([]);
  }, [sessionId]);
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
  const blankWorkspaceOk = useUiStore((s) => s.blankWorkspaceOk);
  // VS-Code-style soft gate: with no project open and no blank-workspace opt-in,
  // the project gate is the ONLY thing on screen — the composer is withheld so
  // a new researcher makes the one choice that matters (open a project) first.
  const projectGateOpen = connected && !sessionId && !workspacePinned && !blankWorkspaceOk;
  const isMac = navigator.userAgent.includes("Mac");
  const overlayTitlebar = isTauri && isMac;

  return (
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div
          data-tauri-drag-region={overlayTitlebar || undefined}
          className={cn(
            // Handoff tab bar: 44px, open (no separator) — the conversation
            // reads as one continuous surface with the app background.
            "flex h-11 shrink-0 items-center gap-1.5 px-3",
            sidebarCollapsed && overlayTitlebar && "pl-[78px]",
          )}
        >
          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              aria-label={t("Expand sidebar")}
              title={`${t("Expand sidebar")} (${isMac ? "⌘B" : "Ctrl+B"})`}
              className="fade-in flex h-8 w-[30px] items-center justify-center rounded-[7px] text-text-300 hover:bg-bg-300 hover:text-text-100"
            >
              <APanel size={16} strokeWidth={1.75} />
            </button>
          )}
          {/* The active session reads as the handoff's active tab chip. */}
          {sessionId && (
            <div className="flex h-8 min-w-0 items-center gap-1.5 rounded-[9px] bg-bg-300 px-3 text-[13.5px] text-text-000">
              <span className="max-w-[240px] truncate">{title ?? ""}</span>
            </div>
          )}
          {/* Folder toggle — VS Code's explorer button. Shown for an open
              session AND on the project-ready screen (project pinned, no
              session yet): a project is a folder, so its files are always one
              click away, even before the first message. */}
          {(sessionId || workspacePinned) && (
            <button
              onClick={() => setShowFiles(!showFiles)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-input px-2.5 text-[12.5px] transition-colors hover:bg-bg-300",
                showFiles ? "bg-bg-300 text-text-000" : "text-text-300",
              )}
              title={`${t("Browse the project folder beside the chat")}${workspace ? ` — ${workspace}` : ""}`}
              aria-pressed={showFiles}
            >
              <AFolder size={13} />
              {/* An open session's folder is a fact — the toggle shows its path
                  (home shortened to `~`) so the researcher always sees where
                  their files are; the full absolute path is in the tooltip. */}
              <span className="max-w-[240px] truncate text-[12px]">
                {workspace ? abbrevHome(workspace) : t("Files")}
              </span>
            </button>
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
          {sessionId && <StepsMenuButton onRun={(p) => void onSend(p)} />}
          {sessionId && (
            <SessionMenuButton
              sessionId={sessionId}
              title={title ?? "session"}
              blocks={thread?.blocks ?? []}
              onOpenArtifact={openArtifact}
            />
          )}
          {/* Guided-mode switch is hidden for now — sessions run autonomous. */}
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

        <div className="relative min-h-0 flex-1">
        <LastMessagePill container={chatEl} />
        <div
          ref={(el) => {
            chatRef.current = el;
            setChatEl(el);
          }}
          onScroll={(e) => {
            onChatScroll(e);
            onStick(e);
          }}
          className="h-full overflow-y-auto"
        >
          <div className="mx-auto flex max-w-[896px] flex-col gap-2.5 px-6 pb-8 pt-3">
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
              // Three empty states: a project is open → its research steps; the
              // project gate → open/create a project (composer withheld); or the
              // blank scratch workspace the user explicitly opted into.
              workspacePinned ? (
                <StepActionsPanel
                  workspaceName={workspace ? baseName(workspace) : null}
                  onRun={(p) => void onSend(p)}
                />
              ) : projectGateOpen ? (
                <WorkflowStarters onPick={(p) => void onSend(p)} />
              ) : (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm text-muted">
                    {t("Blank workspace. Open a project to work with your files.")}
                  </p>
                  <button
                    onClick={() => useUiStore.getState().setBlankWorkspaceOk(false)}
                    className="text-[13px] text-accent underline underline-offset-2 hover:opacity-80"
                  >
                    {t("Open a project")}
                  </button>
                </div>
              )
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
                  <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[12px] text-muted/70 tabular-nums">
                    <span>{mmss(turnElapsed)}</span>
                    <span className="hidden text-muted/50 sm:inline">·</span>
                    <span className="hidden sm:inline">{t("Esc to interrupt")}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        </div>

        {!projectGateOpen && (
        <div className="px-6 pb-4 pt-0">
          <div className="mx-auto max-w-[896px] space-y-3">
            {wasInterrupted && (
              <div className="flex items-center justify-between rounded-[7px] bg-bg-200 px-3 py-2 text-[12px] text-text-300">
                <span>{t("This session was interrupted.")}</span>
                {lastUserPrompt && (
                  <button
                    onClick={() => void onSend(lastUserPrompt)}
                    className="flex items-center gap-1.5 rounded-[6px] px-1.5 py-0.5 text-text-100 transition-colors hover:bg-bg-300 hover:text-text-000"
                  >
                    <APlay size={12} /> {t("Resume")}
                  </button>
                )}
              </div>
            )}
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
                working
                  ? t("Waiting for the reply…")
                  : connected
                    ? t("Ask anything — @ for files, # for sessions, / for skills, ⌘K to search")
                    : t("Connect to chat")
              }
              approvalMode={approvalMode}
              onApprovalModeChange={(mode) => void setApprovalMode(mode)}
              stepCount={sessionId ? lastTurnSteps : 0}
              dockChips={
                // Plan-as-report chip in the composer dock (CS placement).
                // Gated HERE: an always-present element would reserve an empty
                // gray info-bar strip on conversations without a plan.
                planProgress ? <PlanChip progress={planProgress} onOpen={openArtifact} /> : undefined
              }
              notebooks={uniqueNotebooks}
              onOpenNotebook={(path) => {
                const nb = uniqueNotebooks.find((b) => b.path === path);
                if (nb) openArtifact(nb);
              }}
            />
          </div>
        </div>
        )}
      </div>

      {(activeArtifact || showFiles) && (
        <RightPane onClose={activeArtifact ? closeArtifact : () => setShowFiles(false)}>
          <div className="flex h-full flex-col">
          {/* CS's pane tab strip: everything opened this session stays one
              click away; the X trims a tab without losing the rest. */}
          {paneTabs.length > 1 && (
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5">
              {paneTabs.map((b) => {
                const active = activeArtifact?.path === b.path;
                return (
                  <span
                    key={b.path}
                    className={cn(
                      "flex max-w-[180px] shrink-0 items-center gap-1 rounded-input border px-2 py-1 text-[12px]",
                      active
                        ? "border-border bg-surface-2 text-text"
                        : "border-transparent text-muted hover:bg-surface-2 hover:text-text",
                    )}
                  >
                    <button className="min-w-0 truncate" onClick={() => openArtifact(b)}>
                      {b.filename}
                    </button>
                    <button
                      aria-label={`${t("Close")} ${b.filename}`}
                      className="rounded p-0.5 text-muted hover:text-text"
                      onClick={() => {
                        setPaneTabs((tabs) => {
                          const rest = tabs.filter((x) => x.path !== b.path);
                          if (active) {
                            const next = rest[rest.length - 1];
                            if (next) openArtifact(next);
                            else closeArtifact();
                          }
                          return rest;
                        });
                      }}
                    >
                      <AClose size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="min-h-0 flex-1">
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
          </div>
          </div>
        </RightPane>
      )}
    </div>
  );
}

/** Loading placeholder mirroring the thread's real shapes: a user card, agent
 *  text lines, a quiet tool row — so the page never sits blank while history
 *  loads and nothing jumps when the content arrives. */
// Handoff §Screens: history loads behind a top-center spinner + literal
// "Loading earlier messages…" line (text-300, 12.5px) — the same quiet cue
// Claude Science shows, not a skeleton.
function ThreadSkeleton() {
  const t = useT();
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-[12.5px] text-text-300">
      <span
        aria-hidden
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span>{t("Loading earlier messages…")}</span>
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
