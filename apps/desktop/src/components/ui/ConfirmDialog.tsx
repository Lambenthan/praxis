import { useEffect } from "react";

/**
 * Minimal in-app confirmation dialog. `window.confirm` is unreliable inside
 * the desktop webview, so destructive actions confirm through this instead.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-label={title}
        className="w-[360px] rounded-card border border-border bg-surface p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium text-text">{title}</div>
        <p className="mt-1.5 text-sm text-muted">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-input border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-2"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-input bg-error px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
