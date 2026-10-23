import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useLocation, Link } from "react-router-dom";
import { Protected } from "./auth/session";
import StoreLayout from "./storefront/layouts/StoreLayout";
import { State } from "./shared/State";
const Catalog = lazy(() => import("./storefront/pages/Catalog"));
const Product = lazy(() => import("./storefront/pages/Product"));
const Cart = lazy(() => import("./storefront/pages/Cart"));
const Checkout = lazy(() => import("./storefront/pages/Checkout"));
const Login = lazy(() => import("./storefront/pages/Login"));
const Account = lazy(() => import("./storefront/pages/Account"));
const Detail = lazy(() =>
  import("./storefront/pages/Account").then((m) => ({
    default: m.OrderDetail,
  })),
);
const Builder = lazy(() => import("./storefront/pages/Builder"));
const AdminLayout = lazy(() => import("./admin/layouts/AdminLayout"));
const Dashboard = lazy(() => import("./admin/pages/Dashboard"));
const Deferred = lazy(() =>
  import("./admin/pages/Dashboard").then((m) => ({ default: m.Deferred })),
);
const Orders = lazy(() => import("./admin/pages/Orders"));
const AdminCatalog = lazy(() => import("./admin/pages/Catalog"));
const Inventory = lazy(() => import("./admin/pages/Inventory"));
const Analytics = lazy(() => import("./admin/pages/Analytics"));
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = "Market Hardware — Composants PC";
    document.querySelector<HTMLElement>("#main")?.focus();
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <Suspense fallback={<State loading />}>
      <Routes>
        <Route element={<StoreLayout />}>
          <Route index element={<Catalog home />} />
          <Route path="shop" element={<Catalog />} />
          <Route path="products/:id" element={<Product />} />
          <Route path="cart" element={<Cart />} />
          <Route
            path="checkout"
            element={
              <Protected>
                <Checkout />
              </Protected>
            }
          />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Login register />} />
          <Route
            path="account"
            element={
              <Protected>
                <Account />
              </Protected>
            }
          />
          <Route
            path="account/orders/:id"
            element={
              <Protected>
                <Detail />
              </Protected>
            }
          />
          <Route path="pc-builder" element={<Builder />} />
          <Route
            path="*"
            element={
              <div className="container page">
                <h1>Page introuvable</h1>
                <Link to="/">Retour à l'accueil</Link>
              </div>
            }
          />
        </Route>
        <Route
          path="admin"
          element={
            <Protected admin>
              <AdminLayout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<Detail />} />
          <Route path="catalog" element={<AdminCatalog />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="analytics" element={<Analytics />} />
          <Route
            path="observability"
            element={<Deferred kind="observability" />}
          />
          <Route path="pc-builder" element={<Deferred kind="ai" />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
