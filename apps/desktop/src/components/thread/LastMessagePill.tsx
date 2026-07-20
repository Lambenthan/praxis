import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * The "back to your last message" pill: when the user's most recent message
 * scrolls out of view above (a long agent turn pushed it away), a floating
 * pill at the top of the thread offers one click back to it. Mount inside a
 * `relative` wrapper around the scrollable thread container.
 */
export function LastMessagePill({ container }: { container: HTMLElement | null }) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (!container) return;
    const update = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const nodes = container.querySelectorAll<HTMLElement>("[data-user-message]");
        const last = nodes[nodes.length - 1];
        if (!last) {
          setVisible(false);
          return;
        }
        const c = container.getBoundingClientRect();
        const r = last.getBoundingClientRect();
        setVisible(r.bottom < c.top);
      });
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    const mo = new MutationObserver(update);
    mo.observe(container, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf.current);
      container.removeEventListener("scroll", update);
      mo.disconnect();
    };
  }, [container]);

  if (!visible) return null;
  const jump = () => {
    const nodes = container?.querySelectorAll<HTMLElement>("[data-user-message]");
    nodes?.[nodes.length - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
      <button
        onClick={jump}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-text shadow-pop transition-colors hover:bg-surface-2"
      >
        <ChevronUp size={13} /> {t("Your last message")}
      </button>
    </div>
  );
}
