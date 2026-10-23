// Adapted from shadcndashboard FullLayout: sidebar/inset/header/Outlet composition, without demo contexts.
import { NavLink, Outlet, Link } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingBag,
  Layers,
  Warehouse,
  Cpu,
  ArrowUpRight,
  Activity,
  ChartNoAxesCombined,
} from "lucide-react";
import { useAuth } from "../../auth/session";
export default function AdminLayout() {
  const { user } = useAuth();
  return (
    <div className="admin-shell">
      <a className="skip" href="#main">
        Aller au contenu
      </a>
      <aside className="admin-sidebar">
        <Link className="brand" to="/">
          market<span className="brand-light">hardware</span>
        </Link>
        <p className="eyebrow">ESPACE ÉQUIPE</p>
        <nav aria-label="Administration">
          {[
            ["/admin", "Vue d'ensemble", LayoutDashboard],
            ["/admin/orders", "Commandes", ShoppingBag],
            ["/admin/catalog", "Catalogue", Layers],
            ["/admin/inventory", "Inventaire", Warehouse],
            ["/admin/pc-builder", "AI PC Builder", Cpu],
          ].map(([path, title, Icon]) => {
            const Symbol = Icon as typeof Cpu;
            return (
              <NavLink
                end={path === "/admin"}
                to={String(path)}
                key={String(path)}
              >
                <Symbol size={18} />
                {String(title)}
              </NavLink>
            );
          })}
        </nav>
        <div className="admin-secondary">
          <p className="eyebrow">VUES CONTEXTUELLES</p>
          <Link to="/admin/analytics">
            <ChartNoAxesCombined size={16} /> Analytics
          </Link>
          <Link to="/admin/observability">
            <Activity size={16} /> Observabilité
          </Link>
          <Link to="/">
            Retour boutique <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="admin-user">
          <strong>
            {user?.first_name} {user?.last_name}
          </strong>
          <small>{user?.roles.join(" · ")}</small>
        </div>
      </aside>
      <div className="admin-inset">
        <header className="admin-header">
          <span>Market Hardware / Administration</span>
          <span className="pill">ENVIRONNEMENT LOCAL</span>
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="admin-footer">
          Données réelles des API · Aucun indicateur analytique simulé
        </footer>
      </div>
    </div>
  );
}
