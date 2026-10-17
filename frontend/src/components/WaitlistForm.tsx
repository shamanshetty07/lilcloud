import { useState, type FormEvent } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

export function WaitlistForm({ plan, planName, onDone }: { plan: "plus" | "pro"; planName: string; onDone?: () => void }) {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setState("busy");
    try { await api.joinWaitlist(email, plan); setState("done"); }
    catch (err) { setError((err as Error).message); setState("idle"); }
  };

  if (state === "done") {
    return (
      <div className="space-y-3 text-center">
        <p className="font-medium">You're on the list.</p>
        <p className="text-sm text-muted">Thanks! We'll email {email} as soon as {planName} opens.</p>
        <button className="btn btn-ghost" onClick={onDone}>Close</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Join the {planName} waitlist</h3>
        <p className="mt-1 text-sm text-muted">Be first to know when {planName} launches. No spam, one email when it's ready.</p>
      </div>
      <label className="block space-y-1.5"><span className="label">email</span>
        <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus />
      </label>
      {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <button className="btn btn-primary flex-1" disabled={state === "busy"}>{state === "busy" ? "Joining…" : "Join waitlist"}</button>
        {onDone && <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}
