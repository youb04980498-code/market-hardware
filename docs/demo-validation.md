# Validation de démonstration — V3

Critères obligatoires du [cahier des charges V3](MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md), §17. Chaque case reste ouverte jusqu’à obtention des preuves ; les contrôles d’installation du socle ne valident pas ces parcours métier.

- [ ] **AC-01** — Produit approuvé dans PIM puis publié dans MongoDB. Preuve attendue : Fiche publiée, version et ID identiques.
- [ ] **AC-02** — Relations techniques synchronisées dans Neo4j. Preuve attendue : Requête Cypher et provenance des relations.
- [ ] **AC-03** — Catalogue GraphQL fonctionnel. Preuve attendue : Requête `products` filtrée et test d'erreur.
- [ ] **AC-04** — API REST fonctionnelles. Preuve attendue : Création/consultation commande et validation HTTP.
- [ ] **AC-05** — JWT/RBAC appliqués. Preuve attendue : Accès autorisé, 401 et 403 vérifiés.
- [ ] **AC-06** — Stock sans survente. Preuve attendue : Deux commandes concurrentes, résultat cohérent.
- [ ] **AC-07** — Saga et compensation. Preuve attendue : Paiement refusé, réservation libérée.
- [ ] **AC-08** — Outbox et Kafka fiables. Preuve attendue : Reprise après panne, pas de perte après commit.
- [ ] **AC-09** — Streaming opérationnel. Preuve attendue : Événement Kafka reflété dans KPI live.
- [ ] **AC-10** — Batch trimestriel. Preuve attendue : Exécution paramétrée sur plusieurs trimestres et comparaison SQL.
- [ ] **AC-11** — Batch rejouable. Preuve attendue : Deux exécutions ne doublent pas les résultats.
- [ ] **AC-12** — Logs techniques en table. Preuve attendue : Logs structurés consultables avec `trace_id`.
- [ ] **AC-13** — Purge hebdomadaire. Preuve attendue : Logs > 7 jours supprimés ; logs récents conservés.
- [ ] **AC-14** — Persistance des ventes et acheteurs. Preuve attendue : Données intactes après purge et redémarrage.
- [ ] **AC-15** — Sauvegarde/restauration. Preuve attendue : Restauration d'une commande, client, paiement, facture.
- [ ] **AC-16** — Facture automatique. Preuve attendue : `payment.succeeded` -> PDF MinIO + enregistrement unique.
- [ ] **AC-17** — Email de confirmation. Preuve attendue : Message visible dans Mailpit, reprise en cas d'échec.
- [ ] **AC-18** — Idempotence. Preuve attendue : Rejeu paiement/événement sans double facture.
- [ ] **AC-19** — LLM basé sur graphe. Preuve attendue : Réponse justifiée, stock/prix vérifiés via API.
- [ ] **AC-20** — Observabilité. Preuve attendue : Dashboard Grafana, latence, erreurs, métriques Kafka/Spark.
- [ ] **AC-21** — Qualité des données. Preuve attendue : Contrôles d'intégrité SQL et inter-bases exécutables.
- [ ] **AC-22** — Lakehouse complet. Preuve attendue : Datasets visibles dans raw, staging, curated, consumption.
- [ ] **AC-23** — Configurateur PC sous budget. Preuve attendue : BOM complète, total exact et budget restant pour plusieurs budgets.
- [ ] **AC-24** — Compatibilité complète. Preuve attendue : Tests négatifs socket, RAM, boîtier, refroidissement, alimentation, connecteurs et interfaces.
- [ ] **AC-25** — Solver déterministe. Preuve attendue : Configuration reproductible et aucun dépassement de budget.
- [ ] **AC-26** — Absence de solution / données inconnues. Preuve attendue : Réponse explicite sans compatibilité inventée.
- [ ] **AC-27** — Revalidation avant commande. Preuve attendue : Prix et stock vérifiés au checkout ; modification gérée.

Pour chaque critère, consigner la procédure, les données d’entrée, les résultats attendu et observé et les preuves. Tester doublons, événements en retard, annulations, remboursements, indisponibilité et reprise. Un job Spark local ne valide pas les pipelines Kafka/Delta/S3 ni les agrégats métier.
