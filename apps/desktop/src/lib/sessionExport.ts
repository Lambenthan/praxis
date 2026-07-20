import type { ThreadBlock } from "@fishes/shared";
import { addTextToWorkspace } from "@/lib/tauri";

/** Turn a session's thread blocks into a plain Markdown transcript — user
 *  turns as quotes, agent replies as prose, tool steps as a terse list, and
 *  produced files named. Local only: nothing leaves the machine. */
export function threadToMarkdown(title: string, blocks: ThreadBlock[]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const b of blocks) {
    switch (b.kind) {
      case "user":
        lines.push(`## ${b.text}`, "");
        break;
      case "agent":
        lines.push(b.markdown.trim(), "");
        break;
      case "tool-call":
        lines.push(`- \`${b.title}\`${b.status === "failed" ? " — failed" : ""}`);
        break;
      case "artifact":
        lines.push(`- 📎 ${b.filename}`);
        break;
      case "status-line":
        if (b.usage) {
          const cost = b.usage.cost ? ` · $${b.usage.cost.toFixed(3)}` : "";
          lines.push(`> ${b.usage.tokens} tokens${cost}`, "");
        }
        break;
      default:
        break;
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/** Write the transcript into the session's workspace folder and return its
 *  path. The filename is derived from the title; the caller reports it. */
export async function exportSessionMarkdown(
  title: string,
  blocks: ThreadBlock[],
): Promise<string> {
  const safe = (title || "session").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60);
  return addTextToWorkspace(`${safe} — transcript.md`, threadToMarkdown(title, blocks));
}
