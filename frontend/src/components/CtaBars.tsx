import { useEffect, useRef } from "react";

const BARS = 32;
const heights = Array.from({ length: BARS }, (_, i) => {
  const x = (i + 0.5) / BARS * 2 - 1;
  return 0.18 + 0.82 * Math.abs(x) ** 1.7;
});

export function CtaBars() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const host = el?.parentElement;
    if (!el || !host || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bars = Array.from(el.children) as HTMLElement[];
    let frame = 0;
    const apply = (mx: number | null) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => bars.forEach((b, i) => {
        const d = mx === null ? 1 : Math.abs((i + 0.5) / BARS - mx);
        b.style.setProperty("--lift", String(Math.max(0, 1 - d / 0.16) * 0.45));
      }));
    };
    const move = (e: PointerEvent) => { const r = host.getBoundingClientRect(); apply((e.clientX - r.left) / r.width); };
    const leave = () => apply(null);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(frame); host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave); };
  }, []);

  return (
    <div ref={root} aria-hidden="true" className="cta-bars">
      {heights.map((h, i) => (
        <span key={i} style={{ "--h": h, "--i": i } as React.CSSProperties}><i /></span>
      ))}
    </div>
  );
}
