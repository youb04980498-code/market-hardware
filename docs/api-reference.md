# Référence API

Les interfaces ci-dessous sont prévues par le [cahier des charges V3](MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md), §§6–7. Les services, contrats détaillés, opérations, modèles et règles d'autorisation ne sont pas encore implémentés.

| Service | Interface prévue | Données |
| --- | --- | --- |
| `orders` | REST `/api/orders`, `/api/orders/{id}`, `/api/orders/{id}/cancel` | Schéma PostgreSQL `orders` |
| `inventory` | REST `/api/inventory/availability/{product_id}` | Schéma PostgreSQL `inventory` |
| `payments` | REST `/api/payments` | Schéma PostgreSQL `payments` |
| `catalog-graphql` | GraphQL `/graphql` | MongoDB `market_catalog.products` |
| `auth` | REST `/api/auth/login` | Schéma PostgreSQL `auth` |
| `analytics` | REST `/api/analytics/quarterly?year=2026&quarter=3` | Redis et tables analytiques |
| Assistant IA et solver | POST `/api/ai/chat`, POST `/api/ai/builds` ; GET `/api/ai/builds/{build_id}` si persisté | Neo4j en lecture contrôlée, Catalog GraphQL, Inventory REST et solver Python |

Les contrats seront versionnés dans `data/contracts/openapi/` et `data/contracts/graphql/`. Les appels frontend passeront par la gateway. Les paiements sont simulés. Prévoir `/health`, OpenAPI `/docs`, JWT/RBAC et contrôle de propriété, réponses `401`/`403`, pagination et idempotence.

Le catalogue GraphQL public est en lecture : `products`, `product(productId)` et `categories`, avec limites de complexité. Les mutations produit appartiennent au PIM. Le solver retourne BOM, total exact en centimes, budget restant, preuves, horodatages prix/stock, avertissements et alternatives ; aucune compatibilité critique inconnue ne peut être déclarée validée.
