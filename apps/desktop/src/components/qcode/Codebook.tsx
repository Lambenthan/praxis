import type { QCodeDoc } from "@/lib/qcode";
import { codeColor } from "@/lib/qcode";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

export function Codebook({
  doc,
  active,
  onToggle,
}: {
  doc: QCodeDoc;
  active: string | null;
  onToggle: (name: string | null) => void;
}) {
  const t = useT();
  const countByCode: Record<string, number> = {};
  for (const a of doc.annotations) countByCode[a.code] = (countByCode[a.code] ?? 0) + 1;
  return (
    <div className="w-52 shrink-0 overflow-y-auto border-r border-border p-2">
      <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        {t("Codebook")}
      </div>
      {doc.codes.map((c) => {
        const on = active === c.name;
        return (
          <button
            key={c.name}
            onClick={() => onToggle(on ? null : c.name)}
            title={c.description}
            className={cn(
              "mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
              on ? "bg-surface-2 ring-1 ring-border" : "hover:bg-surface-2/60",
            )}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: codeColor(doc, c.name) }}
            />
            <span className="min-w-0 flex-1 truncate text-text">{c.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted">
              {countByCode[c.name] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
