import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { Session } from "@ai4s/shared";
import { BlockList } from "./BlockList";
import { useT } from "@/lib/i18n";

export function ThreadView({ session }: { session: Session }) {
  const t = useT();
  const isExample = session.group === "Examples";
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b border-faint px-6 py-2.5">
        <h1 className="truncate text-[13px] font-medium text-text">{session.title}</h1>
        {isExample && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted ring-1 ring-border">
            {t("Example · read-only")}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-8 py-6">
          <BlockList blocks={session.blocks} />
        </div>
      </div>
      <div className="px-8 pb-5 pt-2">
        <div className="mx-auto flex max-w-[760px] items-center gap-3 rounded-card border border-border bg-surface-2/60 px-4 py-3 text-sm text-muted">
          <Sparkles size={16} className="text-accent" />
          <span>{t("This is a sample session. Start a live agent session to chat for real.")}</span>
          <Link
            to="/live"
            className="ml-auto rounded-input bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
          >
            {t("New session")}
          </Link>
        </div>
      </div>
    </div>
  );
}
