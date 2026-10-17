import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "./lib/auth.tsx";
import { usePath, navigate } from "./lib/router.tsx";
import Landing from "./pages/Landing.tsx";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Docs from "./pages/Docs.tsx";
import Pricing from "./pages/Pricing.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import { useEffect } from "react";

function Routes() {
  const path = usePath();
  const { user, loading } = useAuth();
  const needsAuth = path.startsWith("/app");
  const guestOnly = path === "/signin" || path === "/signup";

  useEffect(() => {
    if (loading) return;
    if (needsAuth && !user) navigate("/signin");
    else if (guestOnly && user) navigate("/app");
  }, [loading, user, needsAuth, guestOnly]);

  if (loading) return <p className="p-10 text-center font-mono text-xs text-muted">loading…</p>;
  if (needsAuth) return user ? <Dashboard /> : null;
  if (path === "/docs") return <Docs />;
  if (path === "/pricing") return <Pricing />;
  if (path === "/auth/callback") return <AuthCallback />;
  if (path === "/signin") return user ? null : <Auth mode="signin" />;
  if (path === "/signup") return user ? null : <Auth mode="signup" />;
  return <Landing />;
}

createRoot(document.getElementById("root")!).render(<AuthProvider><Routes /></AuthProvider>);
