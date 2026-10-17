import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, onUnauthorized, tokenStore, type User } from "./api.ts";
import { navigate } from "./router.tsx";

type AuthState = {
  user: User | null;
  loading: boolean;
  signin: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  signout: () => Promise<void>;
};
const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  useEffect(() => {
    onUnauthorized.handler = () => { tokenStore.clear(); setUser(null); navigate("/signin"); };
    if (!tokenStore.get()) return;
    api.me().then(r => setUser(r.user)).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);

  const accept = (r: { token: string; user: User }) => { tokenStore.set(r.token); setUser(r.user); };
  return (
    <Ctx.Provider value={{
      user, loading,
      signin: async (e, p) => accept(await api.signin(e, p)),
      signup: async (u, e, p) => accept(await api.signup(u, e, p)),
      signout: async () => { await api.logout(); tokenStore.clear(); setUser(null); navigate("/"); },
    }}>{children}</Ctx.Provider>
  );
}
