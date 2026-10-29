import { useState } from "react";
import { PLANS } from "../lib/plans.ts";
import { WaitlistForm } from "./WaitlistForm.tsx";
import { Link } from "../lib/router.tsx";
import { useAuth } from "../lib/auth.tsx";
import { Reveal } from "./Reveal.tsx";

export function PlanCards() {
  const { user } = useAuth();
  const [open, setOpen] = useState<"plus" | "pro" | null>(null);
  const active = PLANS.find(p => p.id === open);

  return (
    <>
      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p, i) => (
          <Reveal key={p.id} delay={i * 100} className="flex">
          <div className={`lift flex w-full flex-col rounded-2xl border p-8 ${p.id === "plus" ? "border-line-strong bg-surface" : "border-line bg-bg"}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-base uppercase tracking-widest">{p.name}</h3>
              {!p.available && <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">coming soon</span>}
            </div>
            <p className="mt-6 flex items-baseline gap-2"><span className="text-5xl font-bold tracking-[-0.05em]">{p.price}</span><span className="text-sm text-muted">{p.period}</span></p>
            <p className="mt-2 font-mono text-sm text-muted">{p.storage} storage</p>
            <p className="mt-5 text-base text-muted">{p.blurb}</p>
            <ul className="mt-6 flex-1 space-y-3 text-base">
              {p.features.map(f => <li key={f} className="flex gap-2 text-muted"><span className="text-fg">✓</span>{f}</li>)}
            </ul>
            {p.available
              ? <Link href={user ? "/app" : "/signup"} className="btn btn-primary mt-8 py-3">{user ? "Your current plan" : "Get started free"}</Link>
              : <button className="btn btn-ghost mt-8 py-3" onClick={() => setOpen(p.id as "plus" | "pro")}>Join the waitlist</button>}
          </div>
          </Reveal>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal onClick={() => setOpen(null)}>
          <div className="w-full max-w-sm rounded-xl border border-line-strong bg-bg p-6" onClick={e => e.stopPropagation()}>
            <WaitlistForm plan={active.id as "plus" | "pro"} planName={active.name} onDone={() => setOpen(null)} />
          </div>
        </div>
      )}
    </>
  );
}
