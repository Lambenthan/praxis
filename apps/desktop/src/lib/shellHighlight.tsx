import type { ReactNode } from "react";

/** Shell command syntax highlighting for tool-card command blocks, per the
 *  handoff README's codeTint spec (hues matched to the live Claude Science
 *  block): command names rust, strings / $()-expansion green, operators gray,
 *  flags brown, plain args near-black. Colors come from --syn-* CSS vars so
 *  light/dark both work. A pure tokenizer — never throws on odd input (Chinese
 *  filenames, unmatched quotes); anything unclassified falls back to arg. */

const STYLE: Record<string, string> = {
  cmd: "var(--syn-cmd)",
  str: "var(--syn-str)",
  var: "var(--syn-var)",
  op: "var(--syn-op)",
  flag: "var(--syn-flag)",
  arg: "var(--syn-arg)",
};

// Order matters: strings, then $()/${}/$VAR expansion, then multi/single-char
// operators, then whitespace, then '=', then a run of non-special chars (a word).
const TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\$\((?:[^()]|\([^)]*\))*\)|\$\{[^}]*\}|\$[A-Za-z_]\w*)|(&&|\|\||>>|<<|[|&;<>])|(\s+)|(=)|([^\s"'$&|;<>=]+)/g;

export function highlightShell(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  let m: RegExpExecArray | null;
  let cmdPos = true; // the next word sits in command position
  let expectValue = false; // the next word is an assignment value (VAR=→value)
  let assignPending = false; // last word was an assignment target; a '=' follows
  let key = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    let cls = "arg";
    if (m[1]) cls = "str";
    else if (m[2]) cls = "var";
    else if (m[3]) {
      cls = "op";
      // Only pipes / logical / sequence operators begin a NEW command; a
      // redirect (>, <, >>, <<) or trailing & keeps the current command's args.
      if (/^(&&|\|\||\||;)$/.test(m[0])) {
        cmdPos = true;
        expectValue = false;
      }
      assignPending = false;
    } else if (m[4]) {
      out.push(m[0]); // whitespace, uncolored
      continue;
    } else if (m[5]) {
      cls = "op"; // '='
      if (assignPending) {
        expectValue = true; // the word after this '=' is the assignment value
        assignPending = false;
      }
    } else if (m[6]) {
      const w = m[6];
      const rest = src.slice(TOKEN.lastIndex);
      if (expectValue) {
        cls = "arg"; // value of a VAR= assignment; a command may still follow
        expectValue = false;
      } else if (/^=/.test(rest) && /^[A-Za-z_]\w*$/.test(w)) {
        cls = "var"; // assignment target: VAR=…  (command position preserved)
        assignPending = true;
      } else if (/^-/.test(w)) {
        cls = "flag"; // -f / --long
      } else if (cmdPos) {
        cls = "cmd"; // command name (rust) — matches the live block (cd, cp, uv…)
        cmdPos = false;
      } else {
        cls = "arg";
      }
    }
    out.push(
      <span key={key++} style={{ color: STYLE[cls] }}>
        {m[0]}
      </span>,
    );
  }
  return out;
}
