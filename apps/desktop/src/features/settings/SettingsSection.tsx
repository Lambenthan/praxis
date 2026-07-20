/**
 * A settings section — the framed container every right-pane section renders
 * inside. Header carries a title, an optional muted hint, and an optional
 * right-aligned `action` slot; the body holds the section's rows. This is the
 * Fishes port of Claude Science's `hc` section primitive, kept on Fishes's
 * Card look (rounded-card + border + shadow-card) so the two-pane surface reads
 * as one system.
 */
export function SettingsSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-card border border-border bg-surface shadow-card first:mt-0">
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="font-serif text-[15px] text-text">{title}</h2>
          {hint && <p className="mt-0.5 max-w-[56ch] text-xs leading-relaxed text-muted">{hint}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
