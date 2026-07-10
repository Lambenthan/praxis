import { useEffect, useRef } from "react";
import type { QCodeDoc } from "@/lib/qcode";
import { codeColor, workbenchSegments } from "@/lib/qcode";
import { cn } from "@/lib/cn";

export function SourcePane({
  doc,
  active,
  focused,
}: {
  doc: QCodeDoc;
  active: string | null;
  focused: number | null;
}) {
  const focusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);
  const focusAnn = focused !== null ? doc.annotations[focused] : null;

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-4">
      {doc.sources.map((s) => (
        <div key={s.id} className="mb-5">
          <div className="mb-1.5 text-[12px] font-medium text-text">{s.title ?? s.id}</div>
          <p className="whitespace-pre-wrap font-serif text-[14px] leading-relaxed text-text">
            {workbenchSegments(doc, s.id).map((seg, i) => {
              if (seg.codes.length === 0) return <span key={i}>{seg.text}</span>;
              const adopted = seg.codes.find((c) => c.status === "adopted");
              const hasActive = active !== null && seg.codes.some((c) => c.name === active);
              const dim = active !== null && !hasActive;
              const paintName = hasActive ? (active as string) : seg.codes[0].name;
              const color = codeColor(doc, paintName);
              const isFocus =
                focusAnn != null &&
                focusAnn.source === s.id &&
                seg.start >= focusAnn.start &&
                seg.end <= focusAnn.end;
              return (
                <mark
                  key={i}
                  ref={isFocus ? focusRef : undefined}
                  data-status={adopted ? "adopted" : "candidate"}
                  className={cn(
                    "rounded-[3px] px-0.5 transition-opacity",
                    isFocus && "ring-2 ring-accent",
                  )}
                  // Adopted = quiet color wash + solid underline (text stays the
                  // body color, readable on every series hue); candidate keeps
                  // the dashed underline. Solid vs dashed carries the decision.
                  style={
                    adopted
                      ? {
                          backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
                          color: "inherit",
                          borderBottom: `2px solid ${color}`,
                          opacity: dim ? 0.3 : 1,
                        }
                      : {
                          backgroundColor: "transparent",
                          color: "inherit",
                          borderBottom: `2px dashed ${color}`,
                          opacity: dim ? 0.35 : 1,
                        }
                  }
                >
                  {seg.text}
                </mark>
              );
            })}
          </p>
        </div>
      ))}
    </div>
  );
}
