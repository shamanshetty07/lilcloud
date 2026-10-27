import { useAuth } from "../lib/auth.tsx";
import { Link, usePath } from "../lib/router.tsx";
import { Logo } from "./Logo.tsx";

const tabs = [
  { href: "/app", label: "Files" },
  { href: "/app/recent", label: "Recently viewed" },
  { href: "/app/groups", label: "Shared spaces" },
];

export function AppHeader() {
  const { user, signout } = useAuth();
  const path = usePath();
  const active = (href: string) => href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="hidden font-mono text-xs text-muted hover:text-fg sm:block">plans</Link>
          <Link href="/docs" className="hidden font-mono text-xs text-muted hover:text-fg sm:block">docs</Link>
          <span className="hidden font-mono text-xs text-muted sm:block">{user?.name}</span>
          <button className="btn btn-ghost" onClick={signout}>Sign out</button>
        </div>
      </div>
      <nav className="mx-auto flex max-w-5xl gap-6 overflow-x-auto px-4" aria-label="App sections">
        {tabs.map(t => (
          <Link key={t.href} href={t.href}
            className={`whitespace-nowrap border-b-2 py-2 font-mono text-xs ${active(t.href) ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
