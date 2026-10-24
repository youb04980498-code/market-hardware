import {
  NavLink,
  Outlet,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingBag,
  Layers,
  Warehouse,
  Cpu,
  ArrowUpRight,
  Activity,
  ChartNoAxesCombined,
  LogOut,
  ChevronRight,
  Box,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../auth/session";
import "../../styles/admin.css";
const destinations = [
  { path: "/admin", title: "Vue d’ensemble", icon: LayoutDashboard },
  { path: "/admin/catalog", title: "Catalogue", icon: Layers },
  { path: "/admin/inventory", title: "Inventaire", icon: Warehouse },
  { path: "/admin/orders", title: "Commandes", icon: ShoppingBag },
  { path: "/admin/analytics", title: "Analytics", icon: ChartNoAxesCombined },
  { path: "/admin/observability", title: "Observabilité", icon: Activity },
];
export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const current =
    destinations.find((d) => d.path === location.pathname) ||
    destinations.find(
      (d) => d.path !== "/admin" && location.pathname.startsWith(d.path),
    );
  async function signout() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setError(
        "Session locale fermée. Le service de déconnexion est indisponible.",
      );
    }
  }
  return (
    <div className="admin-shell command-center" data-theme="light">
      <a className="skip" href="#main">
        Aller au contenu
      </a>
      <aside className="admin-sidebar">
        <Link className="command-brand" to="/admin">
          <span className="brand-symbol">
            <Box size={22} />
          </span>
          <span>
            MARKET<span>HARDWARE</span>
          </span>
        </Link>
        <div className="sidebar-label">ESPACE DE PILOTAGE</div>
        <nav aria-label="Administration">
          {destinations.map((d) => (
            <NavLink key={d.path} end={d.path === "/admin"} to={d.path}>
              <d.icon size={19} />
              <span>{d.title}</span>
              <ChevronRight className="nav-arrow" size={14} />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-context">
          <span className="sidebar-label">ENVIRONNEMENT</span>
          <p>
            <span className="sidebar-live" />
            Plateforme locale
          </p>
          <small>
            Données des services connectés.
            <br />
            Aucune simulation d’indicateurs.
          </small>
        </div>
        <div className="admin-secondary">
          <Link to="/">
            <ArrowUpRight size={17} />
            Ouvrir la boutique
          </Link>
          <Link to="/admin/pc-builder" aria-label="AI PC Builder">
            <Cpu size={17} />
            AI PC Builder <small>À venir</small>
          </Link>
        </div>
        <div className="admin-user">
          <div className="user-avatar">
            {user?.first_name?.slice(0, 1)}
            {user?.last_name?.slice(0, 1)}
          </div>
          <div>
            <strong>
              {user?.first_name} {user?.last_name}
            </strong>
            <small>{user?.roles.join(" · ")}</small>
          </div>
          <button
            aria-label="Se déconnecter"
            title="Se déconnecter"
            onClick={() => void signout()}
          >
            <LogOut size={17} />
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </aside>
      <div className="admin-inset">
        <header className="admin-header">
          <div>
            Administration
            <ChevronRight size={14} />
            <strong>{current?.title || "Détail"}</strong>
          </div>
          <div>
            <span className="local-chip">
              <span />
              Environnement local
            </span>
            <span className="header-role">
              {user?.roles.includes("admin") ? "Administrateur" : "Équipe"}
            </span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="admin-footer">
          <span>Market Hardware · Command Center</span>
          <span>Sources identifiées · Heures UTC · Monnaie EUR</span>
        </footer>
      </div>
    </div>
  );
}
