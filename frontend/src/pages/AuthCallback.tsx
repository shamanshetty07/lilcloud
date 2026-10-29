import { useEffect } from "react";
import { api, tokenStore } from "../lib/api.ts";
import { navigate } from "../lib/router.tsx";

export default function AuthCallback() {
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get("token");
    history.replaceState(null, "", location.pathname);
    if (!token) { navigate("/signin?error=failed"); return; }
    tokenStore.set(token);
    api.me().then(() => { location.replace("/app"); }).catch(() => { tokenStore.clear(); navigate("/signin?error=failed"); });
  }, []);
  return <p className="p-10 text-center font-mono text-xs text-muted">signing you in…</p>;
}
