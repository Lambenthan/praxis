import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Boxes, Check, Package, Puzzle, ShieldCheck, X } from "lucide-react";
import { useRuntimeStore } from "@/lib/runtime";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";

/**
 * Skills, agents, install-a-skill, and detected scientific environment — all real:
 * skills/agents from the OpenCode runtime, environment from the host system.
 */
export function SkillsPage() {
  const t = useT();
  const navigate = useNavigate();
  const { skills, agents, tools, status, disabledSkills, toggleSkill, loadCatalog, detectTools, installSkill } =
    useRuntimeStore();
  const connected = status === "ready";
  const [text, setText] = useState("");
  const [installing, setInstalling] = useState(false);
  // Skills the runtime cannot register while disabled are absent from `skills`,
  // so list them from the disabled set — those not already shown above.
  const shownDirs = new Set(skills.map((s) => skillDir(s.location)).filter(Boolean));
  const disabledOnly = disabledSkills.filter((d) => !shownDirs.has(d));

  useEffect(() => {
    if (connected) void loadCatalog();
    void detectTools();
  }, [connected, loadCatalog, detectTools]);

  const onInstall = async () => {
    // Guideline: never pre-disable the primary button — an empty click
    // explains what is missing instead.
    if (!connected) {
      toast.error(t("Connect the runtime first."));
      return;
    }
    if (!text.trim()) {
      toast.error(t("Paste a skill first — the field above is still empty."));
      return;
    }
    setInstalling(true);
    const id = await installSkill(text.trim());
    setInstalling(false);
    if (id) {
      setText("");
      navigate(`/live/${id}`); // watch the agent install it
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 pb-16 pt-10">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          {t("Skills")}
        </div>
        <h1 className="mt-2 font-serif text-[22px] leading-tight text-text">
          {t("Skills & Agents")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t("Loaded live from the OpenCode runtime — the bundled ai4s-skills pack plus anything under")}{" "}
          <span className="font-mono">.opencode/skills/</span> {t("in your workspace.")}
        </p>
        <Link
          to="/permissions"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          <ShieldCheck size={15} className="shrink-0" />
          {t("Review what the agent may do in Permissions")}
        </Link>

        {/* Install a skill (#1) */}
        <Section title={t("Install a skill")} icon={<Boxes size={15} />}>
          <div className="px-5 py-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t(
                "Paste a skill (Markdown) or a GitHub URL — the agent installs it into .opencode/skills/",
              )}
              rows={3}
              className="w-full resize-y rounded-input border border-border bg-surface px-3 py-2 text-[15px] text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            <div className="mt-2.5 flex items-center gap-3">
              <button
                onClick={onInstall}
                disabled={installing}
                className="flex h-9 shrink-0 items-center rounded-input bg-accent px-3.5 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {installing ? t("Starting…") : t("Install with agent")}
              </button>
              <span className="text-xs text-muted">
                {connected
                  ? t("Opens a session and asks the agent to add it (customize-opencode).")
                  : t("Connect the runtime first.")}
              </span>
            </div>
          </div>
        </Section>

        {/* Environment (#2) */}
        <Section title={t("Scientific environment")} icon={<Package size={15} />}>
          {tools.length === 0 && <Empty>{t("Environment detection runs in the desktop app.")}</Empty>}
          {tools.map((tool) => (
            <div key={tool.name} className="flex items-center gap-3 px-5 py-2.5">
              {tool.found ? (
                <Check size={14} className="shrink-0 text-ok" />
              ) : (
                <X size={14} className="shrink-0 text-muted" />
              )}
              <span className="w-24 text-[15px] text-text">{tool.name}</span>
              <span className="flex-1 truncate text-right font-mono text-[12px] text-muted">
                {tool.found ? tool.version ?? t("found") : t("not found")}
              </span>
            </div>
          ))}
          <p className="px-5 py-3 text-xs leading-relaxed text-muted">
            {t(
              "OpenCode runs code with whatever is installed here (e.g. Python via its shell tool). Python/R/Jupyter are not bundled; install them or a Science Pack to enable analysis.",
            )}
          </p>
        </Section>

        {connected ? (
          <>
            <Section title={`${t("Agents")} (${agents.length})`} icon={<Bot size={15} />}>
              {agents.length === 0 && <Empty>{t("No agents reported.")}</Empty>}
              {agents.map((a) => (
                <RowItem key={a.name} name={a.name} desc={a.description} tag={a.mode} />
              ))}
            </Section>
            <Section title={`${t("Skills")} (${skills.length})`} icon={<Puzzle size={15} />}>
              {skills.length === 0 && disabledOnly.length === 0 && (
                <Empty>{t("No skills loaded yet.")}</Empty>
              )}
              {skills.map((s) => {
                const dir = skillDir(s.location);
                // Only bundled skills (deployed into the app profile) can be
                // toggled — the app owns that directory. Built-in and workspace
                // skills are shown but not toggled here.
                const canToggle = Boolean(dir) && isBundled(s.location);
                return (
                  <RowItem
                    key={s.name}
                    name={s.name}
                    desc={s.description}
                    tag={sourceOf(s.location, t)}
                    control={
                      canToggle ? (
                        <ToggleButton
                          disabled={false}
                          label={t("Disable")}
                          title={t("Remove this skill from the runtime so the agent cannot load it")}
                          onClick={() => void toggleSkill(dir, true)}
                        />
                      ) : undefined
                    }
                  />
                );
              })}
              {disabledOnly.map((dir) => (
                <RowItem
                  key={`disabled:${dir}`}
                  name={dir}
                  desc={t("Disabled — removed from the runtime, so the agent cannot load it.")}
                  tag={t("disabled")}
                  dimmed
                  control={
                    <ToggleButton
                      disabled={false}
                      label={t("Enable")}
                      accent
                      title={t("Restore this skill so the agent can load it again")}
                      onClick={() => void toggleSkill(dir, false)}
                    />
                  }
                />
              ))}
            </Section>
          </>
        ) : (
          <div className="mt-6 rounded-card border border-border bg-surface px-5 py-4 text-[15px] text-muted shadow-card">
            {t("Connect the runtime to list the skills and agents it has loaded.")}
          </div>
        )}
      </div>
    </div>
  );
}

function sourceOf(location: string | undefined, t: (source: string) => string): string | undefined {
  if (!location) return undefined;
  if (location.includes("/builtin/")) return t("built-in");
  if (location.includes("/.opencode/")) return t("project");
  return t("user");
}

/** A bundled skill lives in the app-managed profile skills dir — not built-in,
 *  not a workspace `.opencode/skills` skill. Only these can be toggled, because
 *  the desktop shell owns that directory and can add/remove it. */
function isBundled(location: string | undefined): boolean {
  if (!location) return false;
  return !location.includes("/builtin/") && !location.includes("/.opencode/");
}

/** The skill's directory name — the identity the backend disables by. A skill's
 *  `location` is its SKILL.md path, so the directory is its parent's name. */
function skillDir(location: string | undefined): string {
  if (!location) return "";
  const parts = location.split(/[\\/]/).filter(Boolean);
  // …/<dir>/SKILL.md → <dir>
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function ToggleButton({
  label,
  title,
  onClick,
  accent,
  disabled,
}: {
  label: string;
  title: string;
  onClick: () => void;
  accent?: boolean;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        accent
          ? "rounded-input border border-border px-2.5 py-1 text-xs text-accent transition-colors hover:bg-surface-2 disabled:opacity-50"
          : "rounded-input border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6 overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="shrink-0 text-muted">{icon}</span>
        <h2 className="font-serif text-[15px] text-text">{title}</h2>
      </header>
      <div className="divide-y divide-faint">{children}</div>
    </section>
  );
}

function RowItem({
  name,
  desc,
  tag,
  control,
  dimmed,
}: {
  name: string;
  desc: string;
  tag?: string;
  control?: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <Package size={15} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[15px] ${dimmed ? "text-muted" : "text-text"}`}>{name}</div>
        <div className="line-clamp-2 text-[12px] leading-snug text-muted">{desc}</div>
      </div>
      {tag && <span className="mt-0.5 shrink-0 text-[12px] text-muted">{tag}</span>}
      {control && <div className="shrink-0">{control}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6 text-center text-sm text-muted">{children}</div>;
}
