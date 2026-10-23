export function orderMessage(status: string, complete: boolean) {
  if (!complete)
    return "Traitement en cours — résultat du paiement en vérification. Ne repassez pas commande.";
  return (
    (
      {
        PAID: "Commande confirmée",
        SHIPPED: "Commande expédiée",
        DELIVERED: "Commande livrée",
        PAYMENT_FAILED: "Paiement refusé — commande non confirmée",
        CANCELLED: "Commande annulée",
        REFUNDED: "Commande remboursée",
      } as Record<string, string>
    )[status] ?? "Statut : " + status
  );
}
