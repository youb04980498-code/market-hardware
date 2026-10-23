import { OrderList } from "../../storefront/pages/Account";
export default function Orders() {
  return (
    <div className="admin-page">
      <p className="eyebrow">SUIVI TRANSACTIONNEL</p>
      <h1>Commandes</h1>
      <OrderList admin />
    </div>
  );
}
