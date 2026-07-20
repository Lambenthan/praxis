import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { FolderPlus, Hand, Square, Terminal, Zap } from "lucide-react";
import { AArrowUp, ACheck, AChevronDown, AClose, AList, ANotebook, APaperclip, APlus } from "@/components/icons/anthropic";
import { addFilesToWorkspace, addTextToWorkspace, isTauri, pickFolder, type ApprovalMode } from "@/lib/tauri";
import { getClient, useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/** A paste longer than this becomes a workspace file chip instead of raw text. */
const PASTE_AS_FILE_CHARS = 2000;
const PASTE_AS_FILE_LINES = 25;
/** Max composer height before it scrolls internally (handoff §2: 180px). */
const MAX_HEIGHT_PX = 180;

// Terminal-style input history: every sent input (prompt, "!cmd", "/name args")
// in its typed form, shared across sessions, newest last, ↑/↓ to recall.
const HISTORY_KEY = "ai4s.inputHistory";
const HISTORY_MAX = 100;
function readHistory(): string[] {
  try {
    const arr = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function recordHistory(entry: string): void {
  if (!entry) return;
  const prev = readHistory();
  if (prev[prev.length - 1] === entry) return; // consecutive duplicate
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([...prev, entry].slice(-HISTORY_MAX)));
  } catch {
    /* full or unavailable storage never blocks a send */
  }
}

/** A "/" palette entry — the runtime's config commands, skills and MCP prompts. */
export interface ComposerCommand {
  name: string;
  description?: string;
  source?: string;
}

/** The two approval modes the composer can switch between (Codex-style). */
const APPROVAL_OPTIONS: {
  mode: ApprovalMode;
  label: string;
  description: string;
  icon: typeof Hand;
}[] = [
  {
    mode: "approve",
    label: "Approve for me",
    description: "Asks before deleting, installing, or going remote",
    icon: Hand,
  },
  {
    mode: "full",
    label: "Full access",
    description: "Runs every command without asking",
    icon: Zap,
  },
];

/**
 * The "Ask anything" composer. Static mock sessions pass no `onSend`; the live
 * OpenCode session passes one to submit prompts to the runtime. Attached
 * workspace files show as removable chips above the input, not as prompt text.
 *
 * Two prefix modes (only when their handler is provided):
 *   `!`  — shell mode: the rest of the line runs directly in the session's
 *          workspace folder (terminal styling, no model turn).
 *   `/`  — command palette: pick a slash command (config command / skill /
 *          MCP prompt) with ↑/↓ + Tab/Enter, then type arguments and send.
 *          A "/name" that matches no known command stays a plain prompt.
 */
export function Composer({
  onSend,
  onRunShell,
  onRunCommand,
  commands = [],
  disabled,
  working,
  onStop,
  placeholder,
  approvalMode,
  onApprovalModeChange,
  stepCount,
  dockChips,
  notebooks,
  onOpenNotebook,
  leadingAction,
}: {
  onSend?: (text: string) => void;
  onRunShell?: (command: string) => void;
  onRunCommand?: (name: string, args: string) => void;
  commands?: ComposerCommand[];
  disabled?: boolean;
  /** A turn is running: the send button becomes Stop (wired to `onStop`). */
  working?: boolean;
  onStop?: () => void;
  placeholder?: string;
  /** The approval switch shows only when the surface provides both (the live
   *  session does; static mock sessions don't). */
  approvalMode?: ApprovalMode;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
  /** Handoff §2 dock info bar: the current turn's tool-step count and the
   *  notebooks this session touched. Rendered only when real (count>0 / a
   *  notebook exists) — never a fabricated "Step N of N". */
  stepCount?: number;
  /** Extra chips for the dock info bar (e.g. the plan's Step N of M) — CS
   *  puts plan progress HERE, above the field, not in the page header. */
  dockChips?: React.ReactNode;
  notebooks?: { path: string }[];
  onOpenNotebook?: (path: string) => void;
  /** Extra control rendered immediately LEFT of the "+" button (e.g. the
   *  library drawer's session-history clock). */
  leadingAction?: React.ReactNode;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  /** Highlighted palette row; clamped to the current matches. */
  const [sel, setSel] = useState(0);
  /** Esc closed the palette for the current input; typing reopens it. */
  const [paletteClosed, setPaletteClosed] = useState(false);
  /** A committed slash command: shown as a chip, the input holds arguments. */
  const [command, setCommand] = useState<string | null>(null);
  /** ↑/↓ history navigation; `draft` is what was typed before recalling. */
  const [hist, setHist] = useState<{ index: number; draft: string } | null>(null);
  /** The approval-mode menu is open. */
  const [approvalOpen, setApprovalOpen] = useState(false);
  const approvalRef = useRef<HTMLDivElement>(null);
  /** The "+" add menu (attach files / choose folder) is open. */
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // Dismiss the approval menu on any outside press. (Button blur can't do
  // this: WKWebView never focuses a clicked button, so blur never fires.)
  useEffect(() => {
    if (!approvalOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!approvalRef.current?.contains(e.target as Node)) setApprovalOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [approvalOpen]);
  // Same for the "+" add menu.
  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!addRef.current?.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addOpen]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composerDraft = useUiStore((s) => s.composerDraft);
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);
  // For the "+" menu's "Choose folder…" — only offered for a fresh draft, since
  // a live session's folder is fixed (the top WorkspaceBar shows it).
  const currentId = useRuntimeStore((s) => s.currentId);
  const switchWorkspace = useRuntimeStore((s) => s.switchWorkspace);
  const chooseFolder = async () => {
    const dir = await pickFolder();
    if (dir) await switchWorkspace({ path: dir });
  };

  const shellMode = !!onRunShell && !command && value.startsWith("!");
  // @-files / #-sessions summons: typing "@tok" or "#tok" at a word boundary
  // opens the matching menu; picking replaces the token with the reference.
  const [mentionFiles, setMentionFiles] = useState<string[] | null>(null);
  const sessions = useRuntimeStore((s) => s.sessions);
  const caretToken = (() => {
    const m = /(^|\s)([@#])([^\s@#]*)$/.exec(value);
    return m ? { sigil: m[2] as "@" | "#", text: m[3] } : null;
  })();
  useEffect(() => {
    if (caretToken?.sigil !== "@" || mentionFiles !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const { listDir } = await import("@/lib/artifactFile");
        const top = await listDir("", "workspace");
        const names: string[] = [];
        for (const e of top) {
          if (e.isDir) {
            try {
              const sub = await listDir(e.path, "workspace");
              for (const f of sub) if (!f.isDir) names.push(f.path);
            } catch {
              /* unreadable subdir — skip */
            }
          } else {
            names.push(e.path);
          }
          if (names.length > 200) break;
        }
        if (!cancelled) setMentionFiles(names);
      } catch {
        if (!cancelled) setMentionFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caretToken?.sigil]);
  const mentionMatches = (() => {
    if (!caretToken || disabled) return [];
    const q = caretToken.text.toLowerCase();
    if (caretToken.sigil === "@") {
      return (mentionFiles ?? [])
        .filter((f) => f.toLowerCase().includes(q))
        .slice(0, 8)
        .map((f) => ({ key: f, label: f, insert: f }));
    }
    return sessions
      .filter((se) => se.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((se) => ({ key: se.id, label: se.title, insert: `"${se.title}"` }));
  })();
  const mentionOpen = mentionMatches.length > 0 && !paletteClosed;
  // Reuse the palette's selection state (`sel`) — only one menu is ever open,
  // and it already resets to the top on every edit.
  const mentionSelIndex = Math.min(sel, Math.max(mentionMatches.length - 1, 0));
  const pickMention = (insert: string) => {
    setValue((v) => v.replace(/(^|\s)([@#])([^\s@#]*)$/, (_m, pre) => `${pre}${insert} `));
    taRef.current?.focus();
  };
  // The palette is open while the command NAME is being typed ("/na…"); the
  // first space ends name-typing (arguments follow) and closes it.
  const slashTyping = !!onRunCommand && !command && /^\/\S*$/.test(value);
  const query = slashTyping ? value.slice(1).toLowerCase() : "";
  const matches = slashTyping
    ? commands
        .filter((c) => c.name.toLowerCase().includes(query))
        .sort(
          (a, b) =>
            Number(b.name.toLowerCase().startsWith(query)) -
            Number(a.name.toLowerCase().startsWith(query)),
        )
    : [];
  const paletteOpen = matches.length > 0 && !paletteClosed && !disabled;
  const selIndex = Math.min(sel, Math.max(matches.length - 1, 0));

  // Each edit resets the palette: selection back to the top, Esc-close undone.
  useEffect(() => {
    setSel(0);
    setPaletteClosed(false);
  }, [value]);

  // Committing a command turns it into a chip; the input then holds only the
  // arguments — the "/name" can never degrade into ordinary prompt text.
  const pick = (c: ComposerCommand) => {
    setCommand(c.name);
    setValue("");
    taRef.current?.focus();
  };

  const onChange = (v: string) => {
    setHist(null); // an edit leaves history navigation
    // A full known command name followed by whitespace commits it, same as a
    // pick — whether typed ("/init ") or pasted whole ("/init focus\n…"); the
    // remainder becomes the arguments. Unknown names (paths) stay plain text.
    if (onRunCommand && !command) {
      const m = /^\/(\S+)\s([\s\S]*)$/.exec(v);
      if (m && commands.some((c) => c.name === m[1])) {
        setCommand(m[1]);
        setValue(m[2]);
        taRef.current?.focus();
        return;
      }
    }
    setValue(v);
  };

  const unchip = () => {
    if (!command) return;
    setValue(value ? `/${command} ${value}` : `/${command}`);
    setCommand(null);
    taRef.current?.focus();
  };

  // Consume a draft another surface prepared (e.g. provenance "Reproduce") —
  // prefilled, never auto-sent: the user reviews and presses send. Text the
  // user was already typing is kept, with the draft appended below it.
  useEffect(() => {
    if (composerDraft === null) return;
    setValue((v) => (v.trim() ? `${v.trimEnd()}\n\n${composerDraft}` : composerDraft));
    setComposerDraft(null);
    taRef.current?.focus();
  }, [composerDraft, setComposerDraft]);

  // Auto-grow with the content; show the scrollbar ONLY once the content truly
  // exceeds the cap. Otherwise an empty/short composer flashes a scrollbar —
  // especially under browser zoom, where sub-pixel rounding leaves scrollHeight a
  // hair above the box. (Claude Science's composer has no persistent scrollbar.)
  // The x axis stays hidden ALWAYS (the textarea soft-wraps, so horizontal
  // scrolling is meaningless): at fractional zoom (e.g. the 110% default) the
  // same rounding can leave scrollWidth a hair over clientWidth, and the
  // phantom horizontal bar then eats ~15px of height and clips the line.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full, MAX_HEIGHT_PX)}px`;
    el.style.overflowY = full > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [value]);

  const submit = () => {
    if (disabled) return;
    const text = value.trim();
    setHist(null);
    // A chipped command runs as itself — arguments optional.
    if (command) {
      onRunCommand?.(command, text);
      recordHistory(text ? `/${command} ${text}` : `/${command}`);
      setCommand(null);
      setValue("");
      return;
    }
    // "!" — run the rest of the line as a shell command (no model turn).
    if (shellMode) {
      const line = value.slice(1).trim();
      if (!line) return;
      onRunShell?.(line);
      recordHistory(`!${line}`);
      setValue("");
      return;
    }
    // "/name args" — run a KNOWN slash command; unknown names stay a prompt
    // (a message can legitimately start with a path like "/etc/hosts …").
    if (onRunCommand && text.startsWith("/")) {
      const name = text.slice(1).split(/\s/, 1)[0];
      if (commands.some((c) => c.name === name)) {
        onRunCommand(name, text.slice(1 + name.length).trim());
        recordHistory(text);
        setValue("");
        return;
      }
    }
    if (!text && files.length === 0) return;
    const fileNote =
      files.length > 0 ? `Files added to the workspace: ${files.join(", ")}` : "";
    onSend?.(text && fileNote ? `${text}\n\n${fileNote}` : text || fileNote);
    if (text) recordHistory(text);
    setValue("");
    setFiles([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // During IME composition (e.g. pinyin), Enter picks a candidate — it must
    // not send. WebKit reports the committing keydown as legacy keyCode 229.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // The @/# summon menu is keyboard-driven too: without this, Enter would
    // fall through and send the raw "@tok" instead of completing the reference.
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((i) => Math.min(i + 1, mentionMatches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPaletteClosed(true);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        pickMention(mentionMatches[mentionSelIndex].insert);
        return;
      }
    }
    // While the palette is open, the keyboard drives it, not the send.
    if (paletteOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((i) => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPaletteClosed(true);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        pick(matches[selIndex]);
        return;
      }
    }
    // Backspace on an empty input dissolves the command chip back into text.
    if (e.key === "Backspace" && command && value === "") {
      e.preventDefault();
      unchip();
      return;
    }
    // Terminal-style history: ↑ at the very start of the input recalls the
    // previous sent input; while navigating, ↑/↓ walk older/newer and walking
    // past the newest restores the unsent draft. Any edit leaves navigation.
    if (e.key === "ArrowUp" && !command) {
      const el = taRef.current;
      const atStart = !!el && el.selectionStart === 0 && el.selectionEnd === 0;
      if (hist || atStart) {
        const entries = readHistory();
        const index = (hist ? hist.index : entries.length) - 1;
        if (index >= 0) {
          e.preventDefault();
          setHist({ index, draft: hist ? hist.draft : value });
          setValue(entries[index]);
        }
        return;
      }
    }
    if (e.key === "ArrowDown" && hist) {
      e.preventDefault();
      const entries = readHistory();
      const index = hist.index + 1;
      if (index < entries.length) {
        setHist({ ...hist, index });
        setValue(entries[index]);
      } else {
        setValue(hist.draft);
        setHist(null);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Very long pastes become a workspace file chip instead of flooding the box.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!isTauri || !onSend) return;
    const text = e.clipboardData.getData("text/plain");
    if (text.length <= PASTE_AS_FILE_CHARS && text.split("\n").length <= PASTE_AS_FILE_LINES) {
      return; // normal paste
    }
    e.preventDefault();
    void (async () => {
      try {
        const name = await addTextToWorkspace("pasted.txt", text);
        setFiles((f) => [...f, name]);
      } catch (err) {
        toast.error(`${t("Could not save paste:")} ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  };

  // Copy local files into the agent workspace; they appear as chips.
  const addFiles = async () => {
    setAdding(true);
    try {
      const names = await addFilesToWorkspace();
      if (names.length > 0) setFiles((f) => [...f, ...names]);
    } catch (err) {
      toast.error(`${t("Could not add files:")} ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAdding(false);
    }
  };

  const canAttach = isTauri && !!onSend;
  const canSend =
    !disabled &&
    (command
      ? true // a chipped command may run without arguments
      : shellMode
        ? value.slice(1).trim().length > 0
        : !!value.trim() || files.length > 0);

  return (
    <div className="relative">
      {mentionOpen && (
        <div
          role="listbox"
          aria-label={caretToken?.sigil === "@" ? t("Files") : t("Sessions")}
          className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-card"
        >
          {mentionMatches.map((m, i) => (
            <button
              key={m.key}
              role="option"
              aria-selected={i === mentionSelIndex}
              className={cn(
                "flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left",
                i === mentionSelIndex ? "bg-surface-2" : "hover:bg-surface-2",
              )}
              // mousedown, not click — a click would blur the textarea first.
              onMouseDown={(e) => {
                e.preventDefault();
                pickMention(m.insert);
              }}
            >
              <span className="shrink-0 text-xs text-muted">{caretToken?.sigil}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">{m.label}</span>
            </button>
          ))}
        </div>
      )}
      {paletteOpen && (
        <div
          role="listbox"
          aria-label={t("Commands")}
          className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-card"
        >
          {matches.map((c, i) => (
            <button
              key={c.name}
              role="option"
              aria-selected={i === selIndex}
              className={cn(
                "flex w-full items-baseline gap-2 rounded-input px-2 py-1.5 text-left",
                i === selIndex ? "bg-surface-2" : "hover:bg-surface-2",
              )}
              // mousedown, not click — a click would blur the textarea first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              <span className="shrink-0 font-mono text-xs text-text">/{c.name}</span>
              {c.description && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.description}</span>
              )}
              {(c.source === "skill" || c.source === "mcp") && (
                <span className="shrink-0 rounded px-1 py-0.5 text-[10px] uppercase text-muted ring-1 ring-border">
                  {c.source}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {/* Handoff composer dock: a warm bg-200 tray wraps a white bg-000 card
          that holds the field, its file chips, AND the action row together. */}
      <div className="rounded-dock bg-bg-200 p-2">
      {/* Handoff §2 info bar: a 36px row of chips at the top of the tray — the
          turn's step count and the session's notebooks. Shown only with real
          data (never a fabricated "Step N of N"). */}
      {(dockChips || (stepCount ?? 0) > 0 || (notebooks?.length ?? 0) > 0) && (
        <div className="flex h-10 items-center gap-2 px-1.5 pb-0.5 text-[12px] text-text-200">
          {dockChips}
          {(stepCount ?? 0) > 0 && (
            <span
              className="flex items-center gap-1.5 rounded-full border border-border bg-bg-000 px-2.5 py-1 tabular-nums text-text-300"
              title={t("Tool steps in the latest turn")}
            >
              <AList size={13} />
              {stepCount} {t(stepCount === 1 ? "step" : "steps")}
            </span>
          )}
          {(notebooks ?? []).map((nb) => (
            <button
              key={nb.path}
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-border bg-bg-000 px-2.5 py-1 text-text-200 transition-colors hover:bg-bg-300 hover:text-text-000"
              title={`${t("Open")} ${nb.path}`}
              onClick={() => onOpenNotebook?.(nb.path)}
            >
              <ANotebook size={13} />
              {t("Notebook")}
            </button>
          ))}
        </div>
      )}
      <div
        className={cn(
          "rounded-dock bg-bg-000 px-3 py-2 shadow-dock",
          shellMode ? "ring-1 ring-warn/50" : command ? "ring-1 ring-accent/40" : "",
        )}
      >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-0.5 pb-2 pt-0.5">
          {files.map((name) => (
            // Handoff §2: attachments render as 64×64 tiles (radius 10) with a
            // remove button in the top-right corner.
            <div
              key={name}
              className="group relative flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-[10px] bg-bg-200 p-1.5 ring-1 ring-border-300"
              title={name}
            >
              <APaperclip size={16} className="shrink-0 text-text-400" />
              <span className="w-full truncate text-center font-mono text-[10px] leading-tight text-text-300">
                {name.split("/").pop()}
              </span>
              <button
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-bg-400 text-text-200 shadow-sm hover:bg-bg-300 hover:text-text-000"
                aria-label={`${t("Remove")} ${name}`}
                onClick={() => setFiles((f) => f.filter((n) => n !== name))}
              >
                <AClose size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={
          command
            ? t("Arguments (optional) — Enter to run")
            : shellMode
              ? t("Run a shell command in the workspace folder")
              : (placeholder ?? t("Ask anything — @ for files, # for sessions, / for skills, ⌘K to search"))
        }
        className={cn(
          "max-h-[180px] min-h-[24px] w-full resize-none overflow-hidden bg-transparent px-0.5 py-1 text-[15px] leading-[1.6] text-text-000 outline-none placeholder:text-text-400",
          (shellMode || command) && "font-mono",
        )}
        aria-label={t("Ask anything")}
      />
      {/* Action row lives INSIDE the card: approval + add on the left, model +
          send on the right (handoff layout, no voice). */}
      <div className="flex items-center gap-1 pt-0.5">
        {approvalMode && onApprovalModeChange && (
          <div className="relative shrink-0" ref={approvalRef}>
            {approvalOpen && (
              <div
                role="menu"
                aria-label={t("Approval modes")}
                className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-card border border-border bg-surface p-1 shadow-card"
              >
                <div className="px-2 pb-1 pt-1.5 text-xs text-muted">
                  {t("How should agent actions be approved?")}
                </div>
                {APPROVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.mode}
                    role="menuitemradio"
                    aria-checked={opt.mode === approvalMode}
                    className="flex w-full items-start gap-2 rounded-input px-2 py-1.5 text-left hover:bg-surface-2"
                    // mousedown, not click — a click would blur the textarea first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setApprovalOpen(false);
                      if (opt.mode !== approvalMode) onApprovalModeChange(opt.mode);
                    }}
                  >
                    <opt.icon size={13} className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-text">{t(opt.label)}</span>
                      <span className="block text-xs text-muted">{t(opt.description)}</span>
                    </span>
                    {opt.mode === approvalMode && (
                      <ACheck size={13} className="mt-0.5 shrink-0 text-accent" />
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              aria-label={t("Approval mode")}
              title={t("How agent actions get approved")}
              className="flex h-8 items-center gap-1.5 rounded-input px-2.5 text-[12.5px] text-text-300 hover:bg-bg-200 hover:text-text-100"
              onClick={() => setApprovalOpen((o) => !o)}
            >
              {approvalMode === "full" ? <Zap size={12} /> : <Hand size={12} />}
              <span>{t(APPROVAL_OPTIONS.find((o) => o.mode === approvalMode)?.label ?? "")}</span>
              <AChevronDown size={11} />
            </button>
          </div>
        )}
        {command ? (
          <span
            className="flex h-7 shrink-0 items-center gap-1 rounded-input bg-accent/15 pl-2 pr-1 font-mono text-xs text-accent"
            title={t("Runs this command — type arguments, or press Backspace to edit the name")}
          >
            /{command}
            <button className="rounded p-0.5 hover:bg-accent/20" aria-label={t("Remove command")} onClick={unchip}>
              <AClose size={12} />
            </button>
          </span>
        ) : shellMode ? (
          <span
            className="flex h-7 shrink-0 items-center gap-1 rounded-input bg-warn/15 px-1.5 font-mono text-xs text-warn"
            title={t("Runs directly in the session's workspace folder")}
          >
            <Terminal size={13} />
            shell
          </span>
        ) : (
          canAttach && (
            // "+" first, then the leading action (session-history clock) to its
            // RIGHT — a horizontal control group, not the old vertical stack.
            <div className="flex items-center gap-1">
              <div className="relative shrink-0" ref={addRef}>
                {addOpen && (
                  <div
                    role="menu"
                    aria-label={t("Add to the conversation")}
                    className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-card border border-border bg-surface p-1 shadow-card"
                  >
                    <button
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-xs text-text hover:bg-surface-2"
                      // mousedown, not click — a click would blur the textarea first.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setAddOpen(false);
                        void addFiles();
                      }}
                    >
                      <APaperclip size={13} className="shrink-0 text-muted" />
                      {t("Add files")}
                    </button>
                    {!currentId && (
                      <button
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-xs text-text hover:bg-surface-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setAddOpen(false);
                          void chooseFolder();
                        }}
                      >
                        <FolderPlus size={13} className="shrink-0 text-muted" />
                        {t("Choose folder…")}
                      </button>
                    )}
                  </div>
                )}
                <button
                  aria-label={t("Add")}
                  title={t("Add files or choose a folder")}
                  className="flex h-8 w-8 items-center justify-center rounded-input text-text-300 hover:bg-bg-200 hover:text-text-100 disabled:opacity-40"
                  onClick={() => setAddOpen((o) => !o)}
                  disabled={adding}
                >
                  <APlus size={19} />
                </button>
              </div>
              {leadingAction}
            </div>
          )
        )}
        <span className="flex-1" />
        <ModelPicker />
        {working && onStop ? (
          // Same spot, same shape, one action: the send button becomes Stop
          // while the agent works — always live, even though the input is not.
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-clay text-white hover:bg-clay-emph"
            aria-label={t("Stop")}
            title={t("Interrupt this turn (Esc)")}
            onClick={onStop}
          >
            <Square size={11} fill="currentColor" />
          </button>
        ) : (
          // Handoff: the clay send button appears only when there is something
          // to send; otherwise the row ends at the model picker (no voice).
          canSend && (
            <button
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-clay text-white hover:bg-clay-emph"
              aria-label={t("Send")}
              onClick={submit}
            >
              <AArrowUp size={16} />
            </button>
          )
        )}
      </div>
      </div>
      </div>
    </div>
  );
}


/** The current model, changeable where you send — the way Claude Science
 *  keeps its model picker in the composer's bottom-right. Options load on
 *  first open from the connected providers; picking writes the default. */
function ModelPicker() {
  const t = useT();
  const defaultModel = useRuntimeStore((s) => s.defaultModel);
  const loadCatalog = useRuntimeStore((s) => s.loadCatalog);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((o) => !o);
    if (options === null) {
      getClient()
        ?.listProviders()
        .then((provs) =>
          setOptions(
            provs
              .filter((p) => p.id !== "opencode")
              .flatMap((p) => p.models.map((m) => ({ value: `${p.id}/${m.id}`, label: `${p.name} · ${m.id}` }))),
          ),
        )
        .catch(() => setOptions([]));
    }
  };

  const pick = async (value: string) => {
    setOpen(false);
    try {
      await getClient()!.setDefaultModel(value);
      await loadCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const short = defaultModel ? defaultModel.slice(defaultModel.indexOf("/") + 1) : t("Model");
  return (
    <div className="relative shrink-0" ref={ref}>
      {open && (
        <div
          role="menu"
          aria-label={t("Model")}
          className="absolute bottom-full right-0 z-20 mb-2 max-h-64 w-72 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-pop"
        >
          {options === null && (
            <div className="px-2 py-1.5 text-xs text-muted">{t("Loading…")}</div>
          )}
          {options?.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted">{t("Connect a model first")}</div>
          )}
          {options?.map((o) => (
            <button
              key={o.value}
              role="menuitemradio"
              aria-checked={o.value === defaultModel}
              className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-[13px] text-text hover:bg-surface-2"
              onMouseDown={(e) => {
                e.preventDefault();
                void pick(o.value);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === defaultModel && <ACheck size={13} className="shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      )}
      <button
        aria-label={t("Model")}
        className="flex h-8 items-center gap-1 rounded-input px-2.5 text-[14px] font-medium text-text-300 hover:bg-bg-200 hover:text-text-200"
        onClick={toggle}
      >
        <span className="max-w-[140px] truncate">{short}</span>
        <AChevronDown size={12} />
      </button>
    </div>
  );
}
