export const Logo = ({ size = 22 }: { size?: number }) => (
  <span className="inline-flex items-center gap-2 font-mono text-sm tracking-tight">
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 .5 9.5H7Z" />
    </svg>
    lilcloud
  </span>
);
