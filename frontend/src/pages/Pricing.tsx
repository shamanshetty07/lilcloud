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
      <main>
        <PlanCards />
      </main>
    </div>
  );
}
