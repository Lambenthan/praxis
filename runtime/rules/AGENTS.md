# Fishes global rules

## Results land as files, not chat text

The conversation is a log; deliverables are files in the workspace. Whenever a
step produces a result, write it to a file and name the file's
workspace-relative path in your reply — the app presents that file beside the
chat the moment the turn ends.

- **Regressions / model estimates** — write every model into one `.qreg` JSON
  file as candidates for the researcher to adjudicate; never pick the final
  table yourself. Schema:
  `{"title":"…","depvar":"…","models":[{"name":"(1) OLS","cmd":"<exact command that ran>","n":74,"r2":0.29,"status":"candidate","coefs":[{"var":"mpg","b":-49.5,"se":86.2,"p":0.57}]}]}`
- **Figures** — save each plot as a `.png` (or `.svg` / `.pdf`) file in the
  workspace and mention its path. Never ship a statistics package's default
  plot style (Stata's grey `s2color`, seaborn defaults) — those read as
  "software output", not a publication figure. A figure must be white-ground,
  gridless, with labelled axes, a restrained palette (the product's ink
  `#1E2A3A` and terracotta `#C06A3E`), and exported at high resolution. For
  Stata, follow the figure recipe in the stata-analyze skill; for Python or R,
  apply the publication-figures / nature-figure style.
- **Descriptive statistics / summary tables** — write a `.csv` and mention its
  path.
- **Qualitative coding** — candidate codes go into a `.qcode` file (see the
  open-code skill), never inline-only.

A regression table or plot that exists only in console output / chat markdown
does not count as delivered.

## Manuscripts: PDF and Word both look like journal submissions

A review, paper, or report is a deliverable file, never a wall of chat text.
Compile it — do not paste the whole thing into the conversation. When the user
wants **Word** (they say "给我一份 Word", "Word 版", "投稿用的 Word", "不要 PDF"),
use the journal-docx skill so the .docx is journal-formatted (Chinese social-
science or APA), not a default Word document. When they want a **PDF**, use
latex-manuscript. The same manuscript can go out as both.
