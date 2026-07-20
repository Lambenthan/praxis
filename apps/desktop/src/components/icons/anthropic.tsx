// The real Anthropic (Claude Science / cds) UI icon set — exact SVG paths
// lifted from the design handoff's original DOM (20×20 viewBox). These are the
// refined filled/hairline glyphs the live product uses; lucide's generic
// outline strokes read noticeably cheaper next to them, which is most of the
// "texture" gap. Each icon takes a pixel `size` (default 18) and a `className`
// (color via currentColor). Filled icons render solid; the few outline ones
// (search, customize, file, settings) keep a 1.5px hairline stroke.

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function Filled({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      {children}
    </svg>
  );
}
function Stroke({ size = 18, className, strokeWidth = 1.5, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const AArrowLeft = (p: IconProps) => (
  <Filled {...p}>
    <path d="M8.146 4.646a.5.5 0 0 1 .708.708L4.707 9.5H16.5a.5.5 0 0 1 0 1H4.707l4.147 4.147a.5.5 0 0 1-.708.707l-5-5a.5.5 0 0 1-.062-.631l.062-.077z" />
  </Filled>
);

export const AChevronDown = (p: IconProps) => (
  <Filled {...p}>
    <path d="M16.134 6.16a.5.5 0 1 1 .732.68l-6.5 7-.077.068a.5.5 0 0 1-.655-.068l-6.5-7-.062-.08a.5.5 0 0 1 .718-.667l.076.067L10 12.767z" />
  </Filled>
);

export const APlus = (p: IconProps) => (
  <Filled {...p}>
    <path d="M10 4.5a.5.5 0 0 1 .5.5v4.5H15a.5.5 0 0 1 0 1h-4.5V15a.5.5 0 0 1-1 0v-4.5H5a.5.5 0 0 1 0-1h4.5V5a.5.5 0 0 1 .5-.5" />
  </Filled>
);

export const ANotebook = (p: IconProps) => (
  <Filled {...p}>
    <path d="M16.5 4A1.5 1.5 0 0 1 18 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 14.5V9a.5.5 0 0 1 1 0v5.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5H9a.5.5 0 0 1 0-1z" />
    <path d="M3.5 3.5h3a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.777.416L5 7.85l-.723.566A.5.5 0 0 1 3.5 8V4a.5.5 0 0 1 .5-.5" />
  </Filled>
);

export const AClose = (p: IconProps) => (
  <Filled {...p}>
    <path d="M15.147 4.146a.5.5 0 0 1 .707.707L10.707 10l5.147 5.147a.5.5 0 0 1-.63.771l-.078-.064L10 10.707l-5.146 5.147a.5.5 0 0 1-.708-.707L9.293 10 4.146 4.853a.5.5 0 0 1 .708-.707L10 9.293z" />
  </Filled>
);

export const ASearch = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.2 13.2 17 17" />
  </Stroke>
);

export const AFile = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 1.4}>
    <path d="M6 3.5h5.2a1.5 1.5 0 0 1 1.06.44l2.8 2.8a1.5 1.5 0 0 1 .44 1.06V15A1.5 1.5 0 0 1 14 16.5H6A1.5 1.5 0 0 1 4.5 15V5A1.5 1.5 0 0 1 6 3.5z" />
    <path d="M11 3.7V7a1 1 0 0 0 1 1h3.2" />
  </Stroke>
);

export const ACustomize = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 1.4}>
    <rect x="2.5" y="5.5" width="15" height="10" rx="2" />
    <path d="M7 5.5V4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 13 4.5v1" />
  </Stroke>
);

// Open book for the literature wiki, in the same 1.4px hairline weight.
export const ABook = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 1.4}>
    <path d="M10 5.2C9 4.2 7.5 3.7 5.6 3.7c-1 0-1.9.13-2.6.37V14.2c.7-.24 1.6-.37 2.6-.37 1.9 0 3.4.5 4.4 1.5 1-1 2.5-1.5 4.4-1.5 1 0 1.9.13 2.6.37V4.07c-.7-.24-1.6-.37-2.6-.37-1.9 0-3.4.5-4.4 1.5Z" />
    <path d="M10 5.4v9.7" />
  </Stroke>
);

// A gear, not a sun: the old ray glyph read as a theme toggle (user-reported).
// Lucide's cog outline scaled from its 24-grid into our 20-grid; the group
// strokeWidth compensates the scale so the hairline weight matches the set.
export const ASettings = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 1.4}>
    <g transform="scale(0.8333)" strokeWidth={(p.strokeWidth ?? 1.4) * 1.2}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  </Stroke>
);

// Sidebar collapse (panel) glyph — a rounded rect with a divider, in the same
// hairline weight as the other outline icons.
export const APanel = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 1.4}>
    <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.25" />
    <path d="M7.75 3.75v12.5" />
  </Stroke>
);

export const ACheck = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M4.5 10.4 8 13.9l7.5-8.2" />
  </Stroke>
);

export const AChevronRight = (p: IconProps) => (
  <Filled {...p}>
    <path d="M7.16 3.13a.5.5 0 0 1 .7-.06l7 6a.5.5 0 0 1 0 .76l-7 6a.5.5 0 1 1-.65-.76L13.73 10 7.2 4.42a.5.5 0 0 1-.05-.7z" />
  </Filled>
);

export const AChevronUp = (p: IconProps) => (
  <Filled {...p}>
    <path d="M3.866 13.84a.5.5 0 0 1-.732-.68l6.5-7a.5.5 0 0 1 .732 0l6.5 7a.5.5 0 0 1-.718.667l-.076-.067L10 7.233z" />
  </Filled>
);

export const AFolder = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 1.4}>
    <path d="M2.7 5.2A1.5 1.5 0 0 1 4.2 3.7h3.4a1.5 1.5 0 0 1 1.06.44l1.02 1.02a1.5 1.5 0 0 0 1.06.44H15.8a1.5 1.5 0 0 1 1.5 1.5v6.3a1.5 1.5 0 0 1-1.5 1.5H4.2a1.5 1.5 0 0 1-1.5-1.5z" />
  </Stroke>
);

export const ARefresh = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M15.5 6.5A6 6 0 1 0 16.8 11M15.5 3v3.5H12" />
  </Stroke>
);

export const AArrowUp = (p: IconProps) => (
  <Filled {...p}>
    <path d="M10 16.5a.5.5 0 0 1-.5-.5V5.207L5.354 9.354a.5.5 0 0 1-.708-.708l5-5a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1-.708.708L10.5 5.207V16a.5.5 0 0 1-.5.5" />
  </Filled>
);

export const APlay = (p: IconProps) => (
  <Filled {...p}>
    <path d="M4 4.047A1.5 1.5 0 0 1 6.29 2.77l9.603 5.954a1.5 1.5 0 0 1 0 2.55L6.29 17.227a1.5 1.5 0 0 1-2.275-1.06L4 15.953z" />
  </Filled>
);

export const AExpand = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 1.6}>
    <path d="M12 4h4v4M16 4l-5 5M8 16H4v-4M4 16l5-5" />
  </Stroke>
);

export const AList = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 6h12M4 10h12M4 14h8" />
  </Stroke>
);

export const APaperclip = (p: IconProps) => (
  <Stroke {...p} strokeWidth={p.strokeWidth ?? 1.4}>
    <path d="M13.5 6.5 8 12a2 2 0 0 0 2.83 2.83l5.67-5.66a3.5 3.5 0 0 0-4.95-4.95l-5.9 5.9a5 5 0 0 0 7.07 7.07L17 12" />
  </Stroke>
);
