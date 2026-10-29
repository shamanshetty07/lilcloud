import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.tsx";
import { navigate, Link } from "../lib/router.tsx";
import { Logo } from "../components/Logo.tsx";
import { SocialButtons } from "../components/SocialButtons.tsx";
import { ChromeBackdrop } from "../components/ChromeBackdrop.tsx";

const OAUTH_ERRORS: Record<string, string> = {
  not_configured: "That sign-in option isn't available yet. Please use email for now.",
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in attempt expired. Please try again.",
  email_unverified: "Your account has no verified email address, so we couldn't sign you in.",
  disabled: "This account has been disabled.",
  invalid_request: "Something went wrong with sign-in. Please try again.",
  failed: "We couldn't sign you in. Please try again.",
};

export default function Auth({ mode }: { mode: "signin" | "signup" }) {
  const { signin, signup } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    const code = new URLSearchParams(location.search).get("error");
    return code ? OAUTH_ERRORS[code] ?? OAUTH_ERRORS.failed! : "";
  });
  const [busy, setBusy] = useState(false);
  const isUp = mode === "signup";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (isUp) await signup(username, email, password); else await signin(email, password);
      navigate("/app");
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4">
      <ChromeBackdrop />
      <Link href="/" className="relative mb-8"><Logo size={40} /></Link>
      <form onSubmit={submit} className="glass relative w-full max-w-sm space-y-4 rounded-2xl p-7">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.04em]">{isUp ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-muted">{isUp ? "Start storing everything in the cloud." : "Sign in to see everything you've stored."}</p>
        </div>
        <SocialButtons />
        {isUp && (
          <label className="block space-y-1.5"><span className="label">username</span>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={30} autoComplete="username" />
          </label>
        )}
        <label className="block space-y-1.5"><span className="label">email</span>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="block space-y-1.5"><span className="label">password</span>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={isUp ? 8 : 1} maxLength={72} autoComplete={isUp ? "new-password" : "current-password"} />
        </label>
        {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : isUp ? "Sign up" : "Sign in"}</button>
        <p className="text-center text-sm text-muted">
          {isUp ? "Already have an account? " : "New here? "}
          <Link href={isUp ? "/signin" : "/signup"} className="text-fg underline underline-offset-4">{isUp ? "Sign in" : "Create one"}</Link>
        </p>
      </form>
    </div>
  );
}
