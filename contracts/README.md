# Contrats

Les contrats seront définis avant ou avec leurs implémentations conformément au [cahier des charges V3](../docs/MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md), §§7 et 10. Aucun service métier n'est encore implémenté.

- `openapi/` : commandes, disponibilités, paiements simulés, authentification, analytique trimestrielle et assistant IA ; exemples V3 sous `/api/...`, plus `/health` et OpenAPI `/docs`.
- `graphql/` : catalogue Strawberry en lecture via `/graphql`, requêtes `products`, `product(productId)` et `categories`, pagination et limites de complexité. L'édition produit appartient au PIM.
- `events/` : publication/mise à jour produit, commande créée, stock réservé/libéré, paiement réussi/échoué et facture prête. Les noms définitifs des topics et leur versionnement restent à figer.

Le §6 V3 impose également `POST /api/ai/builds`, et `GET /api/ai/builds/{build_id}` si les configurations sont persistées. Documenter `budget_cents`, usage, exigences et préférences, BOM, `total_cents`, `remaining_cents`, preuves de compatibilité, horodatage prix/stock, avertissements et alternatives. Prévoir le résultat `no_feasible_build` et la revalidation au checkout ; une proposition ne réserve pas de stock.

L'enveloppe V3 comprend `event_id`, `event_type`, `version`, `aggregate_id`, `occurred_at`, `payload` et `correlation_id`. Documenter clés de partition, idempotence, retries bornés, dead-letter et lag. Les montants sont en centimes entiers, les dates en UTC et les références produit utilisent `product_id`.
