import { useState } from "react";
import { PLANS } from "../lib/plans.ts";
import { WaitlistForm } from "./WaitlistForm.tsx";
import { Link } from "../lib/router.tsx";
import { useAuth } from "../lib/auth.tsx";

export function PlanCards() {
  const { user } = useAuth();
  const [open, setOpen] = useState<"plus" | "pro" | null>(null);
  const active = PLANS.find(p => p.id === open);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map(p => (
          <div key={p.id} className={`flex flex-col rounded-xl border p-6 ${p.id === "plus" ? "border-line-strong bg-surface" : "border-line bg-bg"}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-sm uppercase tracking-widest">{p.name}</h3>
              {!p.available && <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">coming soon</span>}
            </div>
            <p className="mt-5 flex items-baseline gap-2"><span className="text-4xl font-bold tracking-[-0.05em]">{p.price}</span><span className="text-sm text-muted">{p.period}</span></p>
            <p className="mt-1 font-mono text-xs text-muted">{p.storage} storage</p>
            <p className="mt-4 text-sm text-muted">{p.blurb}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {p.features.map(f => <li key={f} className="flex gap-2 text-muted"><span className="text-fg">✓</span>{f}</li>)}
            </ul>
            {p.available
              ? <Link href={user ? "/app" : "/signup"} className="btn btn-primary mt-7">{user ? "Your current plan" : "Get started free"}</Link>
              : <button className="btn btn-ghost mt-7" onClick={() => setOpen(p.id as "plus" | "pro")}>Join the waitlist</button>}
          </div>
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
