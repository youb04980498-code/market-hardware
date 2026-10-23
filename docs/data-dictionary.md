# Dictionnaire des données

Ce document résume le modèle logique cible du [cahier des charges V3](MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md), §§4–6. Les tables physiques, migrations et projections restent à implémenter.

| Propriétaire | Stockage | Entités |
| --- | --- | --- |
| Orders | PostgreSQL, schéma `orders` | `customers`, `orders`, `order_items`, `outbox_events` |
| Inventory | PostgreSQL, schéma `inventory` | `warehouses`, `stock`, `reservations` |
| Payments et workers | PostgreSQL, schéma `payments` | `payments`, `invoices`, `notification_deliveries`, outbox de paiement |
| Auth | PostgreSQL, schéma `auth` | `users`, `roles`, `user_roles` |
| PIM | UnoPim, base dédiée | Fiches source, caractéristiques, prix catalogue et approbation |
| Catalog | MongoDB, base `market_catalog` | `products`, projection publiée et versionnée |
| Compatibilités | Neo4j | Produits, contraintes techniques et relations validées avec provenance |
| Logs techniques | PostgreSQL, schéma technique `monitoring` | `application_logs`, purge hebdomadaire des logs de plus de 7 jours |
| PC Build Solver | Résultat applicatif ; persistance à définir si retenue | BOM, budget, totaux, preuves, horodatages prix/stock et alternatives |
| Analytics | Redis et lakehouse | Mesures matérialisées et agrégats à définir |

- `product_id` : identifiant métier numérique stable et cohérent entre PIM, MongoDB, Neo4j, PostgreSQL, événements et lakehouse. Identifiants et prix en BSON Int64 dans MongoDB.
- Montants : entiers en centimes (`price_cents`, `unit_price_cents`, `total_cents`, `amount_cents`).
- Dates : UTC, ISO 8601 dans les échanges et `TIMESTAMPTZ` dans PostgreSQL.
- Relations SQL : clés étrangères à l'intérieur du schéma propriétaire ; références applicatives entre services.
- Clients et utilisateurs : `orders.customers` représente les acheteurs ; `auth.users` représente les utilisateurs de la plateforme.

À compléter avec les types physiques, contraintes, index, valeurs autorisées, règles de qualité et masquage des données lors de l'implémentation.

Neo4j décrit les contraintes, pas les prix courants ni les stocks. Le solver vérifie combinaisons, quantités, dimensions, BIOS, slots et connecteurs. Les prix viennent de Catalog GraphQL et les disponibilités d'Inventory REST ; le devis est recalculé au checkout. La purge technique préserve les données commerciales et l'audit financier ; `monitoring` n'est pas un cinquième schéma métier.
