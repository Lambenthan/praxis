// Inline previews for tool results worth reading in the thread.
// The shell already shows a user-typed "!" command's output under its row;
// this extends the same treatment to tools whose result IS the point for a
// researcher — a Stata run's log tail / messages — without opening files.

const STATA_TOOL = /stata/i;
const MAX_LINES = 24;

/**
 * Preview for a Stata MCP tool's output, or undefined for anything else.
 * stata-mcp answers with JSON (log paths + messages); JSON payloads are
 * flattened to their string leaves so the researcher reads text, not braces.
 * Long output keeps only the tail — the verdict lives at the end of a log.
 */
export function stataOutputPreview(tool: string, output?: string): string | undefined {
  if (!STATA_TOOL.test(tool)) return undefined;
  const raw = output?.trim();
  if (!raw) return undefined;
  let text = raw;
  try {
    const leaves: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string") {
        if (v.trim()) leaves.push(v.trim());
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(JSON.parse(raw));
    // Drop leaves that are just a log-file path (e.g. .../auto_describe.log) —
    // noise in the panel; keep the actual log text (the describe table, the
    // "no error" message). Fall back to all leaves if that leaves nothing.
    const meaty = leaves.filter((l) => !/^\/\S+$/.test(l));
    const kept = meaty.length > 0 ? meaty : leaves;
    if (kept.length > 0) text = kept.join("\n");
  } catch {
    // not JSON — a raw log; use as is
  }
  const lines = text.replace(/\s+$/, "").split("\n");
  if (lines.length <= MAX_LINES) return lines.join("\n");
  return ["…", ...lines.slice(-MAX_LINES)].join("\n");
}

/** The file a Stata tool ran or read — the IN line of its transcript panel. */
export function stataInputPreview(
  tool: string,
  input?: Record<string, unknown>,
): string | undefined {
  if (!STATA_TOOL.test(tool) || !input) return undefined;
  for (const k of ["dofile_path", "file_path"]) {
    const v = input[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}
