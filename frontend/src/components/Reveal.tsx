import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

export function Reveal({ children, delay = 0, as: Tag = "div", className = "" }: {
  children: ReactNode; delay?: number; as?: ElementType; className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <Tag ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={{ "--d": `${delay}ms` } as React.CSSProperties}>{children}</Tag>;
}
