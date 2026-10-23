# Contrats

Les contrats seront définis avant ou avec leurs implémentations. Aucun service métier n'est encore implémenté.

- `openapi/` : commandes, stock/entrepôts, paiements internes, authentification et analytique ; API versionnées `/v1`.
- `graphql/` : schéma du catalogue Strawberry, requêtes et mutations avec permissions.
- `events/` : schémas JSON des topics `market.orders.v1`, `market.payments.v1`, `market.inventory.v1` et `market.clicks.v1`.

L'enveloppe événementielle comprend `event_id`, `event_type`, `event_version`, `occurred_at` et `data`. Les événements de commande utilisent `order_id` comme clé de partition. Les montants sont en centimes entiers, les dates en UTC et les références produit utilisent `product_id`.
