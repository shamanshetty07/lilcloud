import { lazy, Suspense, useEffect, useRef, useState } from "react";

const InteractiveParticles = lazy(() => import("./ui/interactive-particles.tsx"));

const WORD = "lilcloud";
const SOURCE_WIDTH = 1000;
const FAMILY = '"Geist", ui-sans-serif, system-ui, sans-serif';

const drawWord = async (aspect: number) => {
  try { await document.fonts.load(`700 100px ${FAMILY}`); } catch {}
  const width = SOURCE_WIDTH;
  const height = Math.max(1, Math.round(width / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 100px ${FAMILY}`;
  ctx.letterSpacing = "7px";
  const base = ctx.measureText(WORD);
  const fit = Math.min((width * 0.94) / base.width, (height * 0.6) / (base.actualBoundingBoxAscent + base.actualBoundingBoxDescent));
  ctx.font = `700 ${100 * fit}px ${FAMILY}`;
  ctx.letterSpacing = `${7 * fit}px`;
  const m = ctx.measureText(WORD);
  ctx.fillText(WORD, width / 2, height / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  return canvas.toDataURL("image/png");
};

export function LilcloudParticles({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    let cancelled = false;
    let lastAspect = 0;
    const build = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      if (lastAspect && Math.abs(aspect - lastAspect) / lastAspect < 0.03) return;
      lastAspect = aspect;
      drawWord(aspect).then(url => { if (!cancelled) setSrc(url); });
    };
    build();
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(build, 300);
    });
    observer.observe(el);
    return () => { cancelled = true; clearTimeout(timer); observer.disconnect(); };
  }, []);

  return (
    <div ref={ref} className={className} aria-hidden="true">
      {src && (
        <Suspense fallback={null}>
          <InteractiveParticles src={src} allowUpload={false} background="transparent" color="#cfcfcf" maxDimension={300} size={0.55} randomness={2.2} depth={3} />
        </Suspense>
      )}
    </div>
  );
}
