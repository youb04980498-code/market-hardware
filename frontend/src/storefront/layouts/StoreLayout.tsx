// Store shell adapted from ecommerce-react StoreLayout/Navbar/Footer, using one Market router/session.
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Cpu, ShoppingBag, UserRound, ArrowUpRight } from "lucide-react";
import { useCart } from "../cart";
import { useAuth, isStaff } from "../../auth/session";
import { useTranslation } from "react-i18next";
export default function StoreLayout() {
  const count = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <>
      <a className="skip" href="#main">
        Aller au contenu
      </a>
      <div className="top-strip">
        <span>LE HARDWARE, EN TOUTE CLARTÉ.</span>
        <span>Catalogue publié · Paiement simulé · Environnement local</span>
      </div>
      <header className="store-header">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <Cpu size={24} />
          </span>
          <span>
            market<span className="brand-light">hardware</span>
            <small>CHOISISSEZ CHAQUE DÉTAIL.</small>
          </span>
        </Link>
        <nav aria-label="Navigation principale">
          <NavLink to="/shop">{t("shop")}</NavLink>
          <NavLink to="/pc-builder">
            PC Builder <span className="mini-tag">Bientôt</span>
          </NavLink>
          {isStaff(user) && <NavLink to="/admin">Administration</NavLink>}
        </nav>
        <div className="header-actions">
          <Link to="/account" className="icon-link">
            <UserRound size={19} />
            <span>{user ? user.first_name : t("account")}</span>
          </Link>
          <Link to="/cart" className="icon-link">
            <ShoppingBag size={19} />
            <span>
              {t("cart")} ({count})
            </span>
          </Link>
          {user && (
            <button
              className="text-button"
              onClick={() =>
                void logout()
                  .catch(() => {})
                  .finally(() => navigate("/login"))
              }
            >
              Déconnexion
            </button>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="footer">
        <Link className="brand" to="/">
          market<span className="brand-light">hardware</span>
        </Link>
        <p>Les bons composants. Vos propres choix.</p>
        <div>
          <Link to="/shop">
            Catalogue <ArrowUpRight size={14} />
          </Link>
          <Link to="/pc-builder">PC Builder</Link>
          <a href="/licenses/ecommerce-react.txt">Licences</a>
        </div>
        <small>
          Projet local · Les paiements sont simulés. Aucun paiement bancaire
          réel.
        </small>
      </footer>
    </>
  );
}
