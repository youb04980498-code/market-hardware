import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  request,
  setTokens,
  getTokens,
  restoreSession,
  sessionEvents,
} from "../api/client";
import type { User, Tokens } from "../types";
interface Auth {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<Auth>(null!);
export const isStaff = (user: User | null) =>
  !!user?.roles.some((r) => r === "admin" || r === "staff");
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const listener = () => {
      if (!getTokens()) setUser(null);
    };
    sessionEvents.addEventListener("change", listener);
    let active = true;
    void (async () => {
      try {
        if (await restoreSession()) {
          const restored = await request<User>("/api/auth/me");
          if (active) setUser(restored);
        }
      } catch {
        setTokens(null);
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      sessionEvents.removeEventListener("change", listener);
    };
  }, []);
  async function login(username: string, password: string) {
    setLoading(true);
    try {
      const t = await request<Tokens>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ username, password }) },
        false,
      );
      setTokens({
        access_token: t.access_token,
        expires_in: t.expires_in,
        token_type: t.token_type,
      });
      setUser(await request<User>("/api/auth/me"));
    } catch (e) {
      setTokens(null);
      setUser(null);
      throw e;
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    setTokens(null);
    setUser(null);
    await request(
      "/api/auth/logout",
      { method: "POST", body: "{}" },
      false,
    );
  }
  return (
    <Context.Provider value={{ user, loading, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
export function Protected({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status">Restauration de la sessionâ€¦</p>;
  if (!user)
    return (
      <Navigate
        to={
          "/login?redirect=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  if (admin && !isStaff(user))
    return (
      <section className="empty">
        <h1>Accès réservé</h1>
        <p>Un rôle administrateur ou équipe est nécessaire.</p>
        <a href="/">Retour à la boutique</a>
      </section>
    );
  return children;
}
