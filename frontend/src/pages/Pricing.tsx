import { Link } from "../lib/router.tsx";
import { useAuth } from "../lib/auth.tsx";
import { Logo } from "../components/Logo.tsx";
import { PlanCards } from "../components/PlanCards.tsx";

export default function Pricing() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="hidden font-mono text-xs text-muted hover:text-fg sm:block">docs</Link>
            <Link href={user ? "/app" : "/signin"} className="btn btn-primary">{user ? "Open my storage →" : "Sign in →"}</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="label mb-3">pricing</p>
          <h1 className="text-balance text-4xl font-bold tracking-[-0.05em] sm:text-5xl">Start free. Grow when you need to.</h1>
          <p className="mt-4 text-muted">Every account includes 1 GB at no cost. Larger plans are launching soon. Join the waitlist and we'll let you know the moment they open.</p>
        </div>
        <div className="mt-12"><PlanCards /></div>
        <p className="mt-8 text-center font-mono text-xs text-muted">Paid plans are billed yearly once available. Prices shown in USD.</p>
      </main>
    </div>
  );
}
