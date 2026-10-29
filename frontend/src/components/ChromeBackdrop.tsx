// liquid-chrome blobs behind the auth card; purely decorative
export function ChromeBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg width="0" height="0" className="absolute">
        <filter id="liquid">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="1" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="34" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </svg>
      {/* screen corners */}
      <i className="chrome" style={{ width: 520, height: 420, top: -140, right: -120, "--rot": "-14deg" } as React.CSSProperties} />
      <i className="chrome chrome-ring" style={{ width: 560, height: 560, bottom: -260, left: -200, "--dur": "24s" } as React.CSSProperties} />
      {/* tucked under the card edges so they frost through the glass */}
      <i className="chrome" style={{ width: 300, height: 260, top: "calc(50% - 360px)", left: "calc(50% + 70px)", "--dur": "16s", "--dx": "-12px" } as React.CSSProperties} />
      <i className="chrome" style={{ width: 260, height: 300, top: "calc(50% + 20px)", left: "calc(50% - 360px)", "--dur": "20s", "--rot": "18deg" } as React.CSSProperties} />
    </div>
  );
}
