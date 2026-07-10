// Normalize a .pptx for preview. Decks that put run formatting in the
// paragraph's <a:pPr><a:defRPr> (valid OOXML — PowerPoint/WPS resolve runs
// against it) render unstyled in pptx-preview, which only reads per-run
// <a:rPr>: a 48 pt white bold title became 18 px black, invisible on a dark
// slide. Rewriting each slide into the explicit per-run form fixes the
// preview without touching the file on disk or the rendering library.
import JSZip from "jszip";

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

const childNS = (el: Element, localName: string): Element | null => {
  for (const c of Array.from(el.children)) {
    if (c.namespaceURI === A_NS && c.localName === localName) return c;
  }
  return null;
};

/** Merge each paragraph's defRPr into its runs' rPr (existing values win).
 *  Pure string → string; returns the input unchanged when nothing applies. */
export function applyParagraphDefaults(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return xml;
  let changed = false;
  for (const p of Array.from(doc.getElementsByTagNameNS(A_NS, "p"))) {
    const pPr = childNS(p, "pPr");
    const def = pPr && childNS(pPr, "defRPr");
    if (!def) continue;
    for (const run of Array.from(p.children)) {
      // <a:r> text runs and <a:fld> field runs (slide numbers, dates).
      if (run.namespaceURI !== A_NS || (run.localName !== "r" && run.localName !== "fld")) continue;
      let rPr = childNS(run, "rPr");
      if (!rPr) {
        const prefix = def.prefix ? `${def.prefix}:` : "";
        rPr = doc.createElementNS(A_NS, `${prefix}rPr`);
        run.insertBefore(rPr, run.firstChild); // rPr must precede <a:t>
        changed = true;
      }
      for (const attr of Array.from(def.attributes)) {
        if (!rPr.hasAttribute(attr.name)) {
          rPr.setAttribute(attr.name, attr.value);
          changed = true;
        }
      }
      for (const c of Array.from(def.children)) {
        if (!childNS(rPr, c.localName)) {
          rPr.appendChild(c.cloneNode(true));
          changed = true;
        }
      }
    }
  }
  return changed ? new XMLSerializer().serializeToString(doc) : xml;
}

/** Rewrite every slide of the deck through applyParagraphDefaults. Returns the
 *  original bytes untouched when no slide needed it (or on any zip error). */
export async function normalizePptxForPreview(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    let changed = false;
    for (const name of slides) {
      const xml = await zip.files[name].async("string");
      const out = applyParagraphDefaults(xml);
      if (out !== xml) {
        zip.file(name, out);
        changed = true;
      }
    }
    return changed ? await zip.generateAsync({ type: "arraybuffer" }) : bytes;
  } catch {
    return bytes; // a preview normalization must never break the preview
  }
}
