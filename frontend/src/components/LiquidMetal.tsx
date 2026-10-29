import { memo, type ReactNode } from "react";
import { LiquidMetal as LiquidMetalShader } from "@paper-design/shaders-react";
import { Link } from "../lib/router.tsx";

export interface LiquidMetalProps {
  colorBack?: string;
  colorTint?: string;
  speed?: number;
  repetition?: number;
  distortion?: number;
  scale?: number;
  className?: string;
}

export const LiquidMetal = memo(function LiquidMetal({
  colorBack = "#888888", colorTint = "#ffffff", speed = 0.4, repetition = 4, distortion = 0.15, scale = 1, className = "",
}: LiquidMetalProps) {
  return (
    <div aria-hidden className={`absolute inset-0 overflow-hidden ${className}`}>
      <LiquidMetalShader
        colorBack={colorBack} colorTint={colorTint} speed={speed} repetition={repetition} distortion={distortion}
        softness={0} shiftRed={0.3} shiftBlue={-0.3} angle={45} shape="none" scale={scale} fit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
});

export function LiquidMetalLink({ href, children, borderWidth = 4, className = "" }: { href: string; children: ReactNode; borderWidth?: number; className?: string }) {
  return (
    <Link href={href} className={`group relative inline-flex rounded-full shadow-[0_20px_50px_-12px_rgba(0,0,0,.6)] transition-transform active:scale-[.98] ${className}`}>
      <span className="relative inline-flex overflow-hidden rounded-full" style={{ padding: borderWidth }}>
        <LiquidMetal className="rounded-full" />
        <span className="relative rounded-full bg-black px-7 py-3.5 font-mono text-sm uppercase tracking-[.08em] text-fg transition-colors duration-200 group-hover:bg-neutral-900">
          {children}
        </span>
      </span>
    </Link>
  );
}
