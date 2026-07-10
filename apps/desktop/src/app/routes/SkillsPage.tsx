import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Boxes, Check, Package, Puzzle, X } from "lucide-react";
import { useRuntimeStore } from "@/lib/runtime";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/**
 * Skills, agents, install-a-skill, and detected scientific environment — all real:
 * skills/agents from the OpenCode runtime, environment from the host system.
 */
export function SkillsPage() {
  const t = useT();
  const navigate = useNavigate();
  const { skills, agents, tools, status, loadCatalog, detectTools, installSkill } = useRuntimeStore();
  const connected = status === "ready";
  const [text, setText] = useState("");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (connected) void loadCatalog();
    void detectTools();
  }, [connected, loadCatalog, detectTools]);

  const onInstall = async () => {
    if (!text.trim()) return;
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
      <div className="mx-auto max-w-3xl px-8 py-8">
        <h1 className="font-serif text-xl text-text">{t("Skills & Agents")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("Loaded live from the OpenCode runtime — the bundled ai4s-skills pack plus anything under")}{" "}
          <span className="font-mono">.opencode/skills/</span> {t("in your workspace.")}
        </p>

        {/* Install a skill (#1) */}
        <Section title={t("Install a skill")} icon={<Boxes size={15} />}>
          <div className="p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t(
                "Paste a skill (Markdown) or a GitHub URL — the agent installs it into .opencode/skills/",
              )}
              rows={3}
              className="w-full resize-y rounded-input border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={onInstall}
                disabled={!connected || !text.trim() || installing}
                className="rounded-input bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
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
            <div key={tool.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {tool.found ? <Check size={15} className="text-ok" /> : <X size={15} className="text-muted" />}
              <span className="w-24 text-text">{tool.name}</span>
              <span className="flex-1 truncate font-mono text-xs text-muted">
                {tool.found ? tool.version ?? t("found") : t("not found")}
              </span>
            </div>
          ))}
          <p className="px-4 py-2 text-xs text-muted">
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
              {skills.length === 0 && <Empty>{t("No skills loaded yet.")}</Empty>}
              {skills.map((s) => (
                <RowItem key={s.name} name={s.name} desc={s.description} tag={sourceOf(s.location, t)} />
              ))}
            </Section>
          </>
        ) : (
          <div className="mt-6 rounded-card border border-border bg-surface p-5 text-sm text-muted">
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

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
        {icon} {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {children}
      </div>
    </section>
  );
}

function RowItem({ name, desc, tag }: { name: string; desc: string; tag?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Package size={16} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{name}</div>
        <div className={cn("text-xs text-muted", "line-clamp-2")}>{desc}</div>
      </div>
      {tag && (
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted ring-1 ring-border">
          {tag}
        </span>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-muted">{children}</div>;
}
