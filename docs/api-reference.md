# Référence API

Les interfaces ci-dessous sont prévues par l'architecture. Les services, contrats détaillés, opérations, modèles et règles d'autorisation ne sont pas encore implémentés.

| Service | Interface prévue | Données |
| --- | --- | --- |
| `orders-api` | REST `/v1/orders` | Schéma PostgreSQL `orders` |
| `inventory-api` | REST `/v1/inventory`, `/v1/warehouses` | Schéma PostgreSQL `inventory` |
| `payments-api` | REST interne `/v1/payments` | Schéma PostgreSQL `payments` |
| `catalog-api` | GraphQL `/graphql` | MongoDB `market_catalog.products` |
| `auth-api` | REST `/v1/auth` | Schéma PostgreSQL `auth` |
| `analytics-api` | REST `/v1/dashboard`, `/v1/analytics` | Redis et tables analytiques |

Les contrats seront versionnés dans `contracts/openapi/` et `contracts/graphql/`. Les appels frontend passeront par la gateway. Le paiement reste un service interne simulé. Les permissions REST et GraphQL seront documentées avec les réponses `401` et `403` et les règles d'idempotence.
