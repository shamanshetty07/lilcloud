const base = { width: 32, height: 32, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconStack = () => (
  <svg {...base} className="ico ico-stack">
    <rect x="6" y="6" width="20" height="6" rx="2" style={{ "--i": 0 } as React.CSSProperties} />
    <rect x="6" y="13" width="20" height="6" rx="2" style={{ "--i": 1 } as React.CSSProperties} />
    <rect x="6" y="20" width="20" height="6" rx="2" style={{ "--i": 2 } as React.CSSProperties} />
  </svg>
);

export const IconLock = () => (
  <svg {...base} className="ico ico-lock">
    <rect x="7" y="14" width="18" height="13" rx="3" />
    <path className="shackle" d="M11 14v-3a5 5 0 0 1 10 0v3" />
    <circle cx="16" cy="20.5" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconGlobe = () => (
  <svg {...base} className="ico ico-globe">
    <circle className="ring" cx="16" cy="16" r="10" />
    <circle cx="16" cy="16" r="10" />
    <path d="M6 16h20M16 6c3 3 4.5 6.5 4.5 10S19 23 16 26c-3-3-4.5-6.5-4.5-10S13 9 16 6Z" />
  </svg>
);

export const IconBolt = () => (
  <svg {...base} className="ico ico-bar">
    <rect x="5" y="12" width="22" height="8" rx="4" />
    <rect className="fill" x="8" y="15" width="16" height="2" rx="1" fill="currentColor" stroke="none" />
    <path d="M16 4v5M13.5 6.5 16 4l2.5 2.5" />
  </svg>
);
