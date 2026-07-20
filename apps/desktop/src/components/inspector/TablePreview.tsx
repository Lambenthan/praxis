import { useT } from "@/lib/i18n";

// Shared tabular preview: first row of data is the header (csv and xlsx alike).
export interface TableData {
  columns: string[];
  rows: string[][];
  truncated: boolean;
}

// CS CSV/table grammar: proportional cells (not mono), a strong header that
// stays pinned as you scroll. The scroll region lives here so the sticky header
// has a scroll container of its own — it pins reliably regardless of the pane
// around it, and wide tables scroll horizontally under the same header.
export function TablePreview({ table }: { table: TableData }) {
  const t = useT();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              {table.columns.map((c, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-bg-200 px-3 py-2 font-semibold text-text-000"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="whitespace-nowrap px-3 py-1.5 text-[13px] text-text-200">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.truncated && (
        <div className="shrink-0 border-t border-border py-2 text-center text-xs text-muted">
          {t("Showing the first")} {table.rows.length} {t("rows")}
        </div>
      )}
    </div>
  );
}
