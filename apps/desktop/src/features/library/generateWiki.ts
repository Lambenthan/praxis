import { stageForWiki, stageManyForWiki } from "@/lib/library";
import { useRuntimeStore } from "@/lib/runtime";

export interface GenerateOutcome {
  staged: number;
  /** Titles that had no stored PDF and were left out. */
  skipped: string[];
}

/**
 * The shared "Generate wiki" flow for one paper, a sub-research, or the whole
 * project library. Project-centric: the wiki lives in the OPEN PROJECT
 * (`<workspace>/wiki`) and papers are staged from that same project's library
 * (`<workspace>/literature`) into its `raw/papers/`. We deliberately do NOT
 * switch folders: staging reads the ACTIVE workspace's library, so a switch
 * would point it at a different (empty) library — nothing to stage, a "no
 * stored PDF" error, and the user stranded outside their project. Instead we
 * start a fresh draft in the current project (keeps it pinned) so the
 * ingestion runs in its own conversation and accumulates into the one wiki.
 */
export async function stageAndGenerate(
  keys: string[],
  t: (s: string) => string,
  showRun: () => void,
): Promise<GenerateOutcome> {
  const rt = useRuntimeStore.getState();
  // Open the conversation view FIRST, before the (awaited) PDF staging —
  // otherwise clicking "Generate" looks dead for the seconds a big batch takes.
  showRun();
  let prompt: string;
  let outcome: GenerateOutcome;
  if (keys.length === 1) {
    const r = await stageForWiki(keys[0]);
    prompt = t(
      "Use the empirical-ingest skill to ingest {pdf} into this workspace's empirical wiki. The paper's verified metadata (title, creators, DOI) is in {meta} — trust it over anything parsed from the PDF.",
    )
      .replace("{pdf}", r.pdfPath)
      .replace("{meta}", r.metaPath);
    outcome = { staged: 1, skipped: [] };
  } else {
    const res = await stageManyForWiki(keys);
    if (res.staged.length === 0) {
      throw new Error(t("None of these items has a stored PDF."));
    }
    prompt = t(
      "Use the empirical-ingest skill to ingest these {n} papers into this workspace's empirical wiki, one at a time:{list}\nEach paper has a .meta.json sidecar next to its PDF with verified metadata (title, creators, DOI) — trust it over anything parsed from the PDFs.",
    )
      .replace("{n}", String(res.staged.length))
      .replace("{list}", res.staged.map((s) => `\n- ${s.pdfPath}`).join(""));
    outcome = { staged: res.staged.length, skipped: res.skipped };
  }
  // `fresh` — wiki generation is always its OWN conversation, never a
  // continuation of whatever thread was open in the drawer.
  void rt.sendPrompt(prompt, { fresh: true });
  return outcome;
}

/**
 * Conversational English-literature retrieval: a fresh session in the OPEN
 * PROJECT that invokes the literature-search skill — the agent negotiates
 * topic/quantity/filters with the user, searches OpenAlex (reusing the
 * machine's systematic-literature-review scripts when they run), then imports
 * the confirmed list into the project's library via the skill's bridge. Runs
 * in the current project (no folder switch), so imports land in its library.
 */
export async function startLiteratureSearch(
  t: (s: string) => string,
  showRun: () => void,
): Promise<void> {
  const rt = useRuntimeStore.getState();
  showRun();
  void rt.sendPrompt(
    t(
      "Use the literature-search skill to find English literature for me and import it into the library. First confirm with me the topic, how many papers I want, and any filters (years, type); then search OpenAlex with multiple query strings, show me the candidate list for confirmation, and only then import — reporting how many were added and how many came with PDFs.",
    ),
    { fresh: true },
  );
}
