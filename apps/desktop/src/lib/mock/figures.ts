// Deterministic SVG placeholders that read as scientific scatter figures,
// encoded as data URIs. No network assets — offline-friendly.

// Small seeded PRNG so figures are stable across renders and builds.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface Cluster {
  cx: number;
  cy: number;
  color: string;
  spread: number;
  n: number;
}

function scatter(width: number, height: number, clusters: Cluster[], seed: number): string {
  const rng = makeRng(seed);
  const dots: string[] = [];
  for (const c of clusters) {
    for (let i = 0; i < c.n; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = rng() * c.spread;
      const x = (c.cx + Math.cos(angle) * radius).toFixed(1);
      const y = (c.cy + Math.sin(angle) * radius).toFixed(1);
      const r = (1.2 + rng() * 1.3).toFixed(1);
      dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${c.color}" opacity="0.72"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${dots.join(
    "",
  )}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// The brand ink/terracotta, so the demo figures read as this product's, not a
// generic seaborn export.
const INK = "#1e2a3a";
const TERRACOTTA = "#c06a3e";

/** A scatter of points around a rising line with a drawn OLS fit — the canonical
 *  "Y on X" social-science plot (e.g. log wage on schooling). `baseY` is the
 *  pixel row the fit sits at where X starts; a positive `slope` lifts it toward
 *  the top of the frame (SVG y grows downward), so the cloud reads as a genuine
 *  positive relationship rising left-to-right. */
function scatterWithFit(
  width: number,
  height: number,
  opts: {
    n: number;
    slope: number;
    baseY: number;
    noise: number;
    xPad?: number;
    seed: number;
  },
): string {
  const rng = makeRng(opts.seed);
  const pad = opts.xPad ?? 34;
  const lineY = (x: number) => opts.baseY - opts.slope * (x - pad);
  const dots: string[] = [];
  for (let i = 0; i < opts.n; i++) {
    const x = pad + rng() * (width - 2 * pad);
    const y = lineY(x) + (rng() - 0.5) * 2 * opts.noise;
    const r = (1.6 + rng() * 1.4).toFixed(1);
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${INK}" opacity="0.5"/>`);
  }
  const x0 = pad;
  const x1 = width - pad;
  const axes = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#c9ccc6" stroke-width="1"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#c9ccc6" stroke-width="1"/>`;
  const fit = `<line x1="${x0.toFixed(1)}" y1="${lineY(x0).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${lineY(x1).toFixed(1)}" stroke="${TERRACOTTA}" stroke-width="2.4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${axes}${dots.join("")}${fit}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** A coefficient plot: each row a point estimate with a horizontal CI whisker,
 *  against a dashed zero line — the standard way to show a coefficient holding
 *  up (or not) across specifications. `est/lo/hi` are in data units, mapped to
 *  the drawing width by [dataMin, dataMax]. */
function coefPlot(
  width: number,
  height: number,
  rows: { est: number; lo: number; hi: number }[],
  domain: [number, number],
): string {
  const padL = 96;
  const padR = 24;
  const padY = 26;
  const [dmin, dmax] = domain;
  const sx = (v: number) => padL + ((v - dmin) / (dmax - dmin)) * (width - padL - padR);
  const rowH = (height - 2 * padY) / rows.length;
  const zero = sx(0);
  const parts: string[] = [
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<line x1="${zero.toFixed(1)}" y1="${padY - 6}" x2="${zero.toFixed(1)}" y2="${height - padY + 6}" stroke="#c9ccc6" stroke-width="1" stroke-dasharray="4 3"/>`,
  ];
  rows.forEach((r, i) => {
    const y = padY + rowH * (i + 0.5);
    parts.push(
      `<line x1="${sx(r.lo).toFixed(1)}" y1="${y.toFixed(1)}" x2="${sx(r.hi).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="${sx(r.lo).toFixed(1)}" y1="${(y - 4).toFixed(1)}" x2="${sx(r.lo).toFixed(1)}" y2="${(y + 4).toFixed(1)}" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="${sx(r.hi).toFixed(1)}" y1="${(y - 4).toFixed(1)}" x2="${sx(r.hi).toFixed(1)}" y2="${(y + 4).toFixed(1)}" stroke="${INK}" stroke-width="2"/>`,
      `<circle cx="${sx(r.est).toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${TERRACOTTA}"/>`,
    );
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---- Social-science demo figures (replace the bioinformatics placeholders) ----

/** Green-transition intensity rising with patient-capital ownership. */
export const patientCapitalScatter = scatterWithFit(560, 380, {
  n: 240,
  slope: 0.46,
  baseY: 300,
  noise: 40,
  seed: 23,
});

/** The schooling coefficient across four specifications — positive, stable. */
export const wageCoefPlot = coefPlot(
  560,
  300,
  [
    { est: 0.098, lo: 0.075, hi: 0.121 },
    { est: 0.087, lo: 0.066, hi: 0.108 },
    { est: 0.081, lo: 0.058, hi: 0.104 },
    { est: 0.079, lo: 0.052, hi: 0.106 },
  ],
  [-0.02, 0.16],
);

export const citationScatter = scatter(
  360,
  300,
  [
    { cx: 120, cy: 90, color: INK, spread: 60, n: 80 },
    { cx: 230, cy: 200, color: TERRACOTTA, spread: 40, n: 30 },
  ],
  17,
);
