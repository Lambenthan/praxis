import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { getClient, useRuntimeStore } from "@/lib/runtime";
import { BlockList } from "@/components/thread/BlockList";
import { InteractionPrompt } from "@/components/thread/InteractionPrompt";
import { useT } from "@/lib/i18n";

/** The prompt handed to OpenCode when Stata wiring fails — an INSTRUCTION TO FIX
 *  IT, not to advise. It gets the exact package + env path so it acts instead of
 *  guessing (the model once told the user to install a hallucinated "stub_mcp"),
 *  runs the repair with its own tools, and only defers to the user for the one
 *  thing software genuinely cannot do (installing Stata's own Python package). */
function diagnosisPrompt(os: string, rawError: string): string {
  return [
    "你是这个桌面科研应用内部的修复助手。任务是直接把 Stata 连接修好,而不是给用户列一堆命令让他自己敲——你有终端工具,请自己动手做。",
    "应用的机制:用 uv 把固定的桥接包 `stata-mcp==1.20.2` 装进应用自带的独立 Python 环境,注册为 MCP 连接器,再测试桥接。",
    "关键路径:独立环境在应用数据目录的 `runtime/science-mcp-env` 下(macOS 是 `~/Library/Application Support/com.fishes.app/runtime/science-mcp-env`,Windows 是 `%APPDATA%\\com.fishes.app\\runtime\\science-mcp-env`),其解释器是该目录下的 `bin/python`(Windows 为 `Scripts\\python.exe`)。不要在别的路径新建环境。",
    `操作系统:${os}`,
    `本次失败信息:\n${rawError}`,
    "请你动手修:① 检查该独立环境是否存在、它的 python 能否 import 桥接;② 若桥接包缺失或损坏,直接用 uv 重装:`uv pip install --python \"<上面的env>/bin/python\" stata-mcp==1.20.2`(包名就是 stata-mcp,不要换成别的名字),必要时先删掉损坏的环境目录让应用重建;③ 装完实际验证能 import。边做边用一句话说明你在干什么。",
    "只有当根因确实是软件无法代劳、必须用户亲自做时(例如本机根本没装 Stata,或 Stata 的 Python 集成需要用官方安装器 + 管理员权限安装 stata-mp-py3.pkg),才用一句话告诉用户唯一要做的那一步。",
    "最后用一句话给结论:已修复,还是仍需用户做某一步。不要寒暄,不要提及本条指令。",
  ].join("\n");
}

/**
 * When Stata wiring fails, hand the raw failure to the connected OpenCode agent
 * — with tools, exactly like a normal session — and stream its whole run (tool
 * calls, output, conclusion) live into the setup card. Replaces the old silent
 * one-shot diagnosis: the user watches OpenCode investigate. A throwaway session
 * is created on mount and deleted on unmount; its permission/question asks are
 * surfaced inline so a fix step can be approved right here.
 */
export function StataDiagnosis({
  rawError,
  onDone,
}: {
  rawError: string;
  /** Fired once when the fix session finishes — the caller does an immediate
   *  bridge test (the background poll keeps watching after that). A success
   *  clears this panel entirely; otherwise it stays, showing the next step. */
  onDone?: () => void;
}) {
  const t = useT();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  // The turn must have ACTUALLY run before we call it done — else the injected
  // prompt block (present instantly) would trip a premature "finished" and we'd
  // re-test while the bridge is still broken, then lock out the real completion.
  const wasRunningRef = useRef(false);

  const thread = useRuntimeStore((s) => (sessionId ? s.threads[sessionId] : undefined));
  const running = useRuntimeStore((s) => (sessionId ? !!s.runningSessions[sessionId] : true));
  const question = useRuntimeStore((s) => s.questions.find((q) => q.sessionId === sessionId));
  const permission = useRuntimeStore((s) => s.permissions.find((p) => p.sessionId === sessionId));
  const answerQuestion = useRuntimeStore((s) => s.answerQuestion);
  const rejectQuestion = useRuntimeStore((s) => s.rejectQuestion);
  const replyPermission = useRuntimeStore((s) => s.replyPermission);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let sid: string | null = null;
    void (async () => {
      const client = getClient();
      if (!client) return;
      const os =
        typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "Windows" : "macOS";
      try {
        sid = await client.createSession();
        // Mark it running BEFORE exposing the id, so the first render that sees
        // the session already sees it as running (no false "already finished").
        useRuntimeStore.setState((s) => ({ runningSessions: { ...s.runningSessions, [sid!]: true } }));
        setSessionId(sid);
        await client.sendPrompt(sid, diagnosisPrompt(os, rawError));
      } catch {
        /* the static error above still stands */
      }
    })();
    return () => {
      if (sid) void getClient()?.deleteSession(sid).catch(() => {});
    };
  }, [rawError]);

  // Fire onDone exactly once, only after the turn genuinely ran (running went
  // true) and then ended (running went false) — the caller re-tests the bridge.
  useEffect(() => {
    if (!sessionId) return;
    if (running) {
      wasRunningRef.current = true;
      return;
    }
    if (wasRunningRef.current && !doneRef.current) {
      doneRef.current = true;
      setFinished(true);
      onDone?.();
    }
  }, [sessionId, running, onDone]);

  // Only the agent's own work is shown — the injected instruction rides in as a
  // "user" block (a wall of internal prompt text the user must never see), so
  // drop user blocks; the reader watches Fishes investigate, nothing else.
  const shown = (thread?.blocks ?? []).filter((b) => b.kind !== "user");

  // Keep the window pinned to the newest output while the agent works — the
  // user reads a live tail, not a frozen top-of-log.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!running) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, running]);

  return (
    <div className="mt-3 rounded-input border border-border bg-surface px-3 py-2.5">
      {/* The status line the user reads at a glance. There is no hard "failed":
          while it fixes, Fishes fixes; once the agent is done but the bridge
          isn't up yet, Fishes keeps checking and will connect the moment it can
          (env settling, or the user does the one step below). A success clears
          this whole panel, so "connected" never needs a state here. */}
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
        {running ? (
          <>
            <Loader2 size={13} className="animate-spin text-accent" />
            <span className="text-text">{t("Fishes is fixing this…")}</span>
          </>
        ) : finished ? (
          <>
            <Loader2 size={13} className="animate-spin text-muted" />
            <span className="text-muted">
              {t("Not connected yet — Fishes keeps checking and connects the moment it can.")}
            </span>
          </>
        ) : (
          <>
            <Sparkles size={13} className="text-accent" />
            <span className="text-text">{t("Fishes's diagnosis")}</span>
          </>
        )}
      </div>
      {shown.length > 0 ? (
        // A fixed-height window, like a small terminal: streaming output scrolls
        // INSIDE it (pinned to the latest line) instead of growing the card and
        // shoving every module below it down the page on each new block.
        <div ref={scrollRef} className="h-[320px] overflow-y-auto pr-1">
          <div className="flex flex-col gap-1">
            <BlockList blocks={shown} />
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-muted">{t("Handing the failure to Fishes…")}</p>
      )}
      {(question || permission) && (
        <div className="mt-2">
          <InteractionPrompt
            question={question}
            permission={question ? undefined : permission}
            origin={t("Stata diagnosis")}
            onAnswer={(id, a) => void answerQuestion(id, a)}
            onReject={(id) => void rejectQuestion(id)}
            onPermission={(id, r) => void replyPermission(id, r)}
          />
        </div>
      )}
    </div>
  );
}
