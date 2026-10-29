import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, onUnauthorized, tokenStore, userStore, type User } from "./api.ts";
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
  const [user, setUser] = useState<User | null>(() => tokenStore.get() ? userStore.get() : null);
  const [loading, setLoading] = useState(() => !!tokenStore.get() && !userStore.get());

  useEffect(() => {
    onUnauthorized.handler = () => { tokenStore.clear(); setUser(null); navigate("/signin"); };
    if (!tokenStore.get()) return;
    api.me()
      .then(r => { userStore.set(r.user); setUser(r.user); })
      .catch(e => {
        if (e instanceof ApiError && e.status === 0 && userStore.get()) return;
        tokenStore.clear(); setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const accept = (r: { token: string; user: User }) => { tokenStore.set(r.token); userStore.set(r.user); setUser(r.user); };
  return (
    <Ctx.Provider value={{
      user, loading,
      signin: async (e, p) => accept(await api.signin(e, p)),
      signup: async (u, e, p) => accept(await api.signup(u, e, p)),
      signout: async () => { await api.logout(); tokenStore.clear(); setUser(null); navigate("/"); },
    }}>{children}</Ctx.Provider>
  );
}
