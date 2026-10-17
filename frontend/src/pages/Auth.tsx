import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.tsx";
import { navigate, Link } from "../lib/router.tsx";
import { Logo } from "../components/Logo.tsx";

export default function Auth({ mode }: { mode: "signin" | "signup" }) {
  const { signin, signup } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
    <div className="hatch flex min-h-screen flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8"><Logo size={26} /></Link>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-bg p-7">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.04em]">{isUp ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-muted">{isUp ? "Start storing your files in the cloud." : "Sign in to see your files."}</p>
        </div>
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
