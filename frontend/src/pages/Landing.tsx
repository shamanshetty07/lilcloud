import { Link } from "../lib/router.tsx";
import { useAuth } from "../lib/auth.tsx";
import { Logo } from "../components/Logo.tsx";

const features = [
  ["01", "all your files, one place", "Photos, documents, videos, backups. Put it all in one place and find it again in seconds."],
  ["02", "private by default", "Everything you store is tied to your account. Nobody else can see or open it."],
  ["03", "access from anywhere", "Sign in from any device and all your stuff is right there, ready to download."],
  ["04", "simple and fast", "Drag, drop, done. Uploads show live progress and deleting takes one confirmation."],
];

const steps = [
  ["upload", "Drag anything in, up to 25 MB each."],
  ["list", "See everything you've stored, with its size, type and date."],
  ["download", "Pull anything back, exactly as you saved it."],
  ["delete", "Remove it for good with one confirmation."],
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/"><Logo /></Link>
          <nav className="hidden gap-8 font-mono text-xs text-muted sm:flex">
            <a href="#features" className="hover:text-fg">features</a>
            <a href="#how" className="hover:text-fg">how it works</a>
            <Link href="/docs" className="hover:text-fg">docs</Link>
          </nav>
          <div className="flex items-center gap-3">
            {user
              ? <Link href="/app" className="btn btn-primary">Open my storage →</Link>
              : <Link href="/signin" className="btn btn-primary">Sign in →</Link>}
          </div>
        </div>
      </header>

      <main>
        <section className="hatch border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
            <div className="relative border border-line bg-bg px-6 py-20 text-center sm:py-28">
              <i className="corner -left-px -top-px border-l border-t" /><i className="corner -right-px -top-px border-r border-t" />
              <i className="corner -bottom-px -left-px border-b border-l" /><i className="corner -bottom-px -right-px border-b border-r" />
              <p className="label mb-6">cloud storage</p>
              <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[0.95] tracking-[-0.05em] sm:text-7xl">
                everything.<br />anywhere you are.
              </h1>
              <p className="mx-auto mt-7 max-w-xl text-base text-muted sm:text-lg">
                Keep photos, documents, videos and everything else in one place, and get to it from any device. Simple, private cloud storage that stays out of your way.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href={user ? "/app" : "/signup"} className="btn btn-primary">Get started →</Link>
                <a href="#how" className="btn btn-ghost">See how it works</a>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 py-20">
          <p className="label mb-3">features</p>
          <h2 className="max-w-xl text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Small on purpose.</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
            {features.map(([n, t, d]) => (
              <div key={n} className="bg-bg p-7">
                <span className="font-mono text-xs text-muted">{n}</span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="label mb-3">how it works</p>
            <h2 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Four things, done well.</h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([t, d], i) => (
                <li key={t} className="rounded-xl border border-line bg-surface p-5">
                  <span className="font-mono text-xs text-muted">step {i + 1}</span>
                  <p className="mt-3 font-mono text-sm">{t}</p>
                  <p className="mt-2 text-sm text-muted">{d}</p>
                </li>
              ))}
            </ol>
            <div className="mt-14 flex flex-col items-center gap-4 rounded-xl border border-line bg-surface p-10 text-center">
              <h3 className="text-2xl font-bold tracking-[-0.04em]">Ready to try it?</h3>
              <Link href={user ? "/app" : "/signup"} className="btn btn-primary">Create an account →</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center font-mono text-xs text-muted">
        lilcloud · simple cloud storage
      </footer>
    </div>
  );
}
