import { cn } from "./cn";

/**
 * Rendering for a notebook cell's output, matching Claude Science's output
 * grammar: borderless tinted panels (`bg-bg-100 rounded p-2 text-xs`) with a
 * height cap, danger-palette stderr/errors, and sanitized `text/html` (pandas
 * DataFrames) shown as bordered tables. Shared by the full-page editor and the
 * inspector so both surfaces render identically.
 */

// Allow-list mirrored on Claude Science's NotebookPreview sanitizer: enough for
// pandas/`display()` HTML (tables, basic block/inline formatting), nothing that
// can execute or load remote content. Everything else is dropped.
const ALLOWED_TAGS = new Set([
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "div", "span", "p", "br", "hr", "b", "strong", "i", "em", "u", "s", "code", "pre",
  "sub", "sup", "small", "a", "ul", "ol", "li", "dl", "dt", "dd", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6",
]);
const ALLOWED_ATTR = new Set([
  "href", "title", "colspan", "rowspan", "scope", "align", "valign", "target", "rel",
]);

/**
 * Minimal safe HTML sanitizer (no third-party dep). Parses the untrusted HTML
 * in a detached document (never live, so nothing runs), then keeps only
 * allow-listed elements/attributes — dropping `<script>`/`<style>`, every
 * `on*` handler, and any `javascript:` link. Returns a string safe to inject.
 */
export function sanitizeHtml(dirty: string): string {
  const doc = new DOMParser().parseFromString(dirty, "text/html");
  const clean = (parent: Element) => {
    for (const el of Array.from(parent.children)) {
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        el.remove(); // strips <script>/<style> and their content wholesale
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (!ALLOWED_ATTR.has(name) || name.startsWith("on")) el.removeAttribute(attr.name);
      }
      if (tag === "a") {
        const href = el.getAttribute("href") ?? "";
        if (/^\s*javascript:/i.test(href)) el.removeAttribute("href");
        else if (href) {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      clean(el); // recurse into the now-allowed element
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

/**
 * Best-effort classification of a flattened output string as an error/stderr,
 * so it can carry the danger palette. The cell model folds tracebacks into the
 * plain `output` text, so there is no structured flag to read — this matches
 * the app's own error strings plus standard Python traceback signatures.
 */
export function isErrorText(s: string): boolean {
  return (
    /^(kernel error:|Interrupted —)/.test(s) ||
    /(^|\n)Traceback \(most recent call last\)/.test(s) ||
    /(^|\n)[\w.]*(Error|Exception): /.test(s)
  );
}

// CS table grammar: bordered cells on the tinted panel, subtly tinted header.
const TABLE_CSS =
  "[&_table]:border-collapse [&_th]:border [&_th]:border-border-300 [&_th]:bg-bg-200 " +
  "[&_th]:px-2 [&_th]:py-1 [&_th]:font-medium [&_td]:border [&_td]:border-border-300 " +
  "[&_td]:px-2 [&_td]:py-1";

export function CellOutput({
  output,
  image,
  html,
  imageAlt = "figure",
}: {
  output?: string;
  image?: string;
  html?: string;
  imageAlt?: string;
}) {
  return (
    <>
      {html && (
        <div
          className={cn(
            "mt-1.5 max-h-96 overflow-auto rounded bg-bg-100 p-2 text-xs text-text-200",
            TABLE_CSS,
          )}
          // sanitizeHtml strips scripts/handlers/remote links before injection.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
      )}
      {output && (
        <pre
          className={cn(
            "mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-bg-100 p-2 font-mono text-xs",
            isErrorText(output) ? "text-error" : "text-text-200",
          )}
        >
          {output}
        </pre>
      )}
      {image && (
        <img
          src={`data:image/png;base64,${image}`}
          alt={imageAlt}
          className="mt-1.5 max-h-64 max-w-full rounded"
        />
      )}
    </>
  );
}
