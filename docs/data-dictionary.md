# Dictionnaire des données

Ce document décrit le modèle logique prévu. Les tables physiques et les migrations restent à implémenter. Voir [l'architecture, section 4](architecture/MARKET_HARDWARE_ARCHITECTURE.md#4-bases-de-données-et-schémas).

| Propriétaire | Stockage | Entités |
| --- | --- | --- |
| Orders | PostgreSQL, schéma `orders` | `customers`, `orders`, `order_items`, `outbox_events` |
| Inventory | PostgreSQL, schéma `inventory` | `warehouses`, `stock`, `reservations` |
| Payments | PostgreSQL, schéma `payments` | `payments` |
| Auth | PostgreSQL, schéma `auth` | `users`, `roles`, `user_roles` |
| Catalog | MongoDB, base `market_catalog` | `products` |
| Analytics | Redis et lakehouse | Mesures matérialisées et agrégats à définir |

- `product_id` : identifiant métier numérique attribué par le catalogue et conservé dans tous les systèmes.
- Montants : entiers en centimes (`price_cents`, `unit_price_cents`, `total_cents`, `amount_cents`).
- Dates : UTC, ISO 8601 dans les échanges et `TIMESTAMPTZ` dans PostgreSQL.
- Relations SQL : clés étrangères à l'intérieur du schéma propriétaire ; références applicatives entre services.
- Clients et utilisateurs : `orders.customers` représente les acheteurs ; `auth.users` représente les utilisateurs de la plateforme.

À compléter avec les types physiques, contraintes, index, valeurs autorisées, règles de qualité et masquage des données lors de l'implémentation.
