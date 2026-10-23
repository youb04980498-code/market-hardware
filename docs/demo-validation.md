# Validation de démonstration

Plan de validation à exécuter au fur et à mesure des implémentations. Les éléments non cochés ne sont pas encore démontrés par ce dépôt.

- [ ] Installation reproductible sur une machine vierge.
- [ ] Rôles PostgreSQL restreints, schémas, tables et catalogue MongoDB initialisés.
- [ ] Données synthétiques déterministes ; références produit et totaux cohérents.
- [ ] Contrats REST, GraphQL et Kafka validés.
- [ ] Connexion et rôles applicatifs ; réponses `401` et `403` vérifiées.
- [ ] Commande payée, réservation atomique et publication outbox.
- [ ] Paiement échoué, compensation et libération idempotente du stock.
- [ ] Réémission d'une requête ou d'un événement sans double comptage.
- [ ] Cinq onglets alimentés par les services réels.
- [ ] Streaming : fenêtres, watermark, état, checkpoints et alertes.
- [ ] Lakehouse : raw, staging, curated et consumption ; qualité et masquage.
- [ ] Delta Lake : historique et time travel.
- [ ] Arrêt/reprise : résultats et doublons mesurés.
- [ ] Métriques, traces, logs et supervision exploitables.
- [ ] Tests unitaires, contrat, intégration, E2E et reprise automatisés.

Pour chaque scénario, consigner la commande ou procédure, les données d'entrée, le résultat attendu, le résultat observé et les preuves. La disponibilité d'un conteneur ne suffit pas à valider un scénario métier.
