import { useId } from "react";
import { cn } from "@/lib/cn";

interface SettingRowProps {
  /** The setting's name — becomes a real <label> when `htmlFor` is given. */
  label: string;
  /** Optional one-line explanation, clamped to a comfortable 56ch measure. */
  description?: string;
  /** The shrink-0 control on the right (a picker, toggle, button…). */
  control?: React.ReactNode;
  /** Optional full-width slot rendered under the label/control line (for a
   *  wide control — e.g. a searchable model picker — or a radio list). */
  below?: React.ReactNode;
  /** When set, the label becomes a <label htmlFor> for its control. */
  htmlFor?: string;
  className?: string;
}

/**
 * One setting row: a label + optional 56ch muted description on the left, an
 * optional shrink-0 control on the right, and an optional full-width `below`
 * slot underneath. The row is one a11y group (`role="group"` with
 * `aria-labelledby` / `aria-describedby`) so a screen reader announces the
 * label and description together. Ported from Claude Science's `na` row grammar.
 */
export function SettingRow({
  label,
  description,
  control,
  below,
  htmlFor,
  className,
}: SettingRowProps) {
  const labelId = useId();
  const descId = useId();

  const labelCls = "text-[15px] text-text";
  const labelEl = htmlFor ? (
    <label id={labelId} htmlFor={htmlFor} className={labelCls}>
      {label}
    </label>
  ) : (
    <div id={labelId} className={labelCls}>
      {label}
    </div>
  );

  const line = (
    <>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {labelEl}
        {description && (
          <div
            id={descId}
            className="max-w-[56ch] text-xs leading-relaxed text-muted [text-wrap:pretty]"
          >
            {description}
          </div>
        )}
      </div>
      {control && <div className="flex shrink-0 items-center">{control}</div>}
    </>
  );

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={description ? descId : undefined}
      className={cn("py-2.5 first:pt-0 last:pb-0", className)}
    >
      {below ? (
        <>
          <div className="flex items-center justify-between gap-6">{line}</div>
          <div className="mt-3">{below}</div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-6">{line}</div>
      )}
    </div>
  );
}
