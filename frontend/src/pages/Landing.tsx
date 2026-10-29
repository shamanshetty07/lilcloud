import { Link } from "../lib/router.tsx";
import { playSound } from "../lib/sounds/sound-engine.ts";
import { iAbilitiesTurnPageBSound } from "../lib/sounds/i-abilities-turn-page-b.ts";
import { LiquidMetalLink } from "../components/LiquidMetal.tsx";
import { useAuth } from "../lib/auth.tsx";
import { Logo } from "../components/Logo.tsx";
import { PlanCards } from "../components/PlanCards.tsx";
import { Reveal } from "../components/Reveal.tsx";
import { CtaBars } from "../components/CtaBars.tsx";
import { GitHubLink, REPO_URL } from "../components/GitHubLink.tsx";
import { IconStack, IconLock, IconGlobe, IconBolt } from "../components/FeatureIcons.tsx";

// page-turn click for the header nav; ignores clicks between links, and a blocked/failed sound is harmless
const turnPage = (e: React.MouseEvent) => {
  if ((e.target as HTMLElement).closest("a")) playSound(iAbilitiesTurnPageBSound.dataUri, { volume: 0.5 }).catch(() => {});
};

const features = [
  ["01", "all your stuff, one place", "Photos, documents, videos, backups. Put it all in one place and find it again in seconds."],
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
          <nav className="hidden gap-8 font-mono text-xs text-muted sm:flex" onClick={turnPage}>
            <a href="#features" className="hover:text-fg">features</a>
            <a href="#how" className="hover:text-fg">how it works</a>
            <a href="#pricing" className="hover:text-fg">pricing</a>
            <Link href="/docs" className="hover:text-fg">docs</Link>
          </nav>
          <div className="flex items-center gap-3">
            <GitHubLink />
            {user
              ? <Link href="/app" className="btn btn-primary">Open my storage →</Link>
              : <Link href="/signin" className="btn btn-primary">Sign in →</Link>}
          </div>
        </div>
      </header>

      <main>
        <section className="hatch border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
            <div className="hero-in relative border border-line bg-bg px-6 py-14 text-center sm:py-20">
              <i className="corner -left-px -top-px border-l border-t" /><i className="corner -right-px -top-px border-r border-t" />
              <i className="corner -bottom-px -left-px border-b border-l" /><i className="corner -bottom-px -right-px border-b border-r" />
              <p className="label mb-6">cloud storage</p>
              <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-7xl">
                Keep everything.<br />Access it anywhere.
              </h1>
              <p className="mx-auto mt-7 max-w-xl text-base text-muted sm:text-lg">
                Photos, documents, videos and everything in between, all in one place and ready on any device. Simple, private storage that stays out of your way.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href={user ? "/app" : "/signup"} className="btn btn-primary">Get started →</Link>
                <a href="#how" className="btn btn-ghost">See how it works</a>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
          <Reveal><p className="label mb-3">features</p></Reveal>
          <Reveal delay={80}><h2 className="max-w-xl text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Small on purpose.</h2></Reveal>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
            {features.map(([n, t, d], i) => {
              const Icon = [IconStack, IconLock, IconGlobe, IconBolt][i]!;
              return (
                <Reveal key={n} delay={i * 90} className="feature bg-bg p-7">
                  <div className="flex items-start justify-between">
                    <span className="num font-mono text-xs text-muted">{n}</span>
                    <Icon />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section id="how" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
            <Reveal><p className="label mb-3">how it works</p></Reveal>
            <Reveal delay={80}><h2 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Four things, done well.</h2></Reveal>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([t, d], i) => (
                <Reveal as="li" key={t} delay={i * 90} className="list-none">
                  <div className="lift h-full rounded-xl border border-line bg-surface p-5">
                    <span className="font-mono text-xs text-muted">step {i + 1}</span>
                    <p className="mt-3 font-mono text-sm">{t}</p>
                    <p className="mt-2 text-sm text-muted">{d}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
            <Reveal className="cta-glow relative mt-10 overflow-hidden rounded-xl border border-line px-6 py-16 text-center sm:py-24">
              <CtaBars />
              <div className="cta-scrim relative -mx-6 flex flex-col items-center gap-5 px-6 py-6">
                <h3 className="text-4xl font-bold tracking-[-0.04em] sm:text-6xl">Ready to try it?</h3>
                <p className="max-w-md text-muted">1 GB free, no card needed. Upload your first file in under a minute.</p>
                <LiquidMetalLink href={user ? "/app" : "/signup"}>Create an account →</LiquidMetalLink>
              </div>
            </Reveal>
          </div>
        </section>
        <section id="pricing" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
            <Reveal><p className="label mb-3">pricing</p></Reveal>
            <Reveal delay={80}><h2 className="max-w-3xl text-balance text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Start free. Grow when you need to.</h2></Reveal>
            <Reveal delay={140}><p className="mt-4 max-w-xl text-lg text-muted">1 GB on the house. Larger plans are launching soon, so join the waitlist to hear first.</p></Reveal>
            <div className="mt-10"><PlanCards /></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center font-mono text-xs text-muted">
        lilcloud · simple cloud storage · <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-fg">source on GitHub</a>
      </footer>
    </div>
  );
}
