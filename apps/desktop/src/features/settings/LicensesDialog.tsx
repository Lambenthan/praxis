import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Key third-party components bundled with the Fishes desktop app, with their
 * SPDX license. This is a curated summary for at-a-glance compliance — the
 * canonical, full license text of every dependency ships inside its own
 * `node_modules/<pkg>/LICENSE`. Fishes itself is MIT-lineage (forked from the
 * MIT `open-science` base; see `UPSTREAM_FREEZE.txt`).
 */
const LICENSES: { name: string; license: string }[] = [
  { name: "OpenCode (bundled agent runtime)", license: "MIT" },
  { name: "Tauri", license: "Apache-2.0 / MIT" },
  { name: "React · React DOM", license: "MIT" },
  { name: "React Router", license: "MIT" },
  { name: "Tailwind CSS", license: "MIT" },
  { name: "Radix UI", license: "MIT" },
  { name: "lucide-react", license: "ISC" },
  { name: "cmdk", license: "MIT" },
  { name: "zustand", license: "MIT" },
  { name: "react-markdown · remark-gfm", license: "MIT" },
  { name: "three.js", license: "MIT" },
  { name: "d3", license: "ISC" },
  { name: "sigma.js · graphology", license: "MIT" },
  { name: "pixi.js", license: "MIT" },
  { name: "highlight.js", license: "BSD-3-Clause" },
  { name: "exceljs · jszip", license: "MIT" },
  { name: "SheetJS (xlsx)", license: "Apache-2.0" },
];

export function LicensesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/35" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] flex max-h-[80vh] w-[520px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card border border-border bg-surface shadow-card"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="font-serif text-[15px] text-text">
                {t("Third-Party Licenses")}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 max-w-[56ch] text-xs leading-relaxed text-muted">
                {t(
                  "Fishes is MIT-licensed (forked from the open-science base). It bundles these open-source components; each package ships its full license text.",
                )}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("Close")}
              className="shrink-0 rounded-input p-1 text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <ul className="divide-y divide-border">
              {LICENSES.map((l) => (
                <li key={l.name} className="flex items-center justify-between gap-4 py-2 text-[14px]">
                  <span className="min-w-0 truncate text-text">{l.name}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {l.license}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
