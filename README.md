# Market Hardware

Plateforme de pilotage d'un e-commerce de matériel informatique : commandes, catalogue, stock, paiements simulés, analytique et observabilité.

## État du dépôt

Le dépôt suit le scaffold V3. L'infrastructure locale comprend PostgreSQL 16, MongoDB 7, Neo4j et UnoPim avec sa base dédiée, Redis, Elasticsearch, queue worker, scheduler et Mailpit. Les services de données utilisent des volumes persistants. Les vérifications de santé sont obligatoires pour PostgreSQL, MongoDB, Neo4j et tous les services UnoPim. Redis et MinIO du socle initial restent disponibles. Kafka est optionnel sous les profils `kafka`/`streaming` et publie les événements transactionnels quand il est activé ; Prometheus et Grafana utilisent `monitoring`.

Les sources de données synthétiques sont suivies dans Git sous `data/`. Auth, Orders, Inventory, Payments, le catalogue GraphQL, la synchronisation PIM, le publisher outbox et l'application React boutique/administration sont implémentés. La Phase 6 ajoute Analytics, Spark Structured Streaming, Delta sur MinIO et les rapports trimestriels. L'IA et les workers de facturation restent à implémenter. Les répertoires réservés sont suivis avec `.gitkeep` ; leur présence seule ne signifie pas qu'une application est développée.

La référence fonctionnelle et technique est le [cahier des charges V3](docs/MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md). Ses exigences MUST et critères AC-01 à AC-27 définissent la cible à implémenter et à valider. L'[architecture V1](docs/architecture/MARKET_HARDWARE_ARCHITECTURE.md) est conservée comme historique ; la V3 prévaut en cas de divergence. Les conventions de développement figurent dans [AGENTS.md](AGENTS.md).

La cible V3 comprend aussi Ollama/Qwen, les workers métier de facturation/notification et la purge hebdomadaire des logs techniques âgés de plus de 7 jours. Ces flux applicatifs restent à implémenter. Le frontend dispose du profil Compose `frontend` ; Spark utilise le profil optionnel analytics ; aucun service IA n'est démarré.

## Boutique et administration — Phase 5

Après le démarrage du backend commerce, lancer :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-frontend.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-frontend.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-frontend.ps1
```

La boutique est accessible sur http://localhost:8080/ et l'administration sur http://localhost:8080/admin. Utiliser les comptes DEV_CUSTOMER/DEV_ADMIN du fichier `.env` local ; ne jamais intégrer leurs valeurs au bundle frontend. Le jeton d'accès reste en mémoire et le jeton de renouvellement reste dans un cookie `HttpOnly` strict, permettant de restaurer la session après rechargement sans exposer ce secret à JavaScript. Voir la [documentation Phase 5](docs/phase5-frontend.md) pour les sources MIT adaptées, les routes, contrats, tests et limitations.

Le configurateur PC sous budget est obligatoire : un solver Python déterministe produit une BOM complète, vérifie les compatibilités, les prix et le stock via les sources autorisées, puis recalcule au checkout. Le LLM interprète et explique les résultats ; le solver porte les contraintes et le calcul. Les nouveaux critères AC-23 à AC-27 couvrent cette fonction. La [V2](docs/MARKET_HARDWARE_CAHIER_DES_CHARGES_V2.md) est conservée pour historique.

## Démarrage local sous Windows

Prérequis : Docker Desktop avec conteneurs Linux, Git, Python 3.12, Node.js LTS et JDK 17.

```powershell
cd C:\market-hardware
# Crée .venv et installe les dépendances Python ; génère .env s'il est absent.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-market.ps1 -SkipPackages -SkipContainers
# Démarre l'infrastructure locale, attend la santé des conteneurs puis vérifie les connexions.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
```

Pour installer aussi les outils Windows sur une nouvelle machine, omettre `-SkipPackages`. Le premier démarrage peut compiler MinIO depuis sa révision officielle épinglée ; l'image locale est ensuite réutilisée.

Ce dépôt reprend le nom Compose `market-hardware` et les volumes du dossier `C:\market-local-setup`. Sur cette machine, le fichier `.env` local existant a été repris et reste ignoré par Git. Il ne faut pas générer de nouveaux identifiants pour des volumes déjà initialisés.

Pour activer la supervision ou arrêter les services :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1 -WithMonitoring
# Kafka seulement lors de la future phase événementielle :
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1 -WithKafka
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-market.ps1
```

L'arrêt conserve les volumes. Le démarrage par défaut arrête un éventuel Kafka existant sans supprimer son volume. Les migrations et imports Phase 2 sont exécutés explicitement avec `scripts/initialize-data.ps1`, séparément du démarrage des conteneurs. GitHub conserve le code, les fixtures et la documentation ; l'exécution, les secrets et les bases restent locaux.

## Accès à l'infrastructure

Neo4j et la pile UnoPim sont maintenant déclarés dans le Compose racine. UnoPim utilise sa propre base PostgreSQL, Redis, Elasticsearch, workers et Mailpit. La publication approuvée vers MongoDB/Neo4j est implémentée dans la Phase 3. Les identifiants administrateur générés sont conservés localement dans `.local/unopim-admin-credentials.txt` (ignoré par Git).

| Service | Adresse locale |
| --- | --- |
| PostgreSQL | `127.0.0.1:5432`, base `market_db` |
| MongoDB | `127.0.0.1:27017`, catalogue dans `market_catalog` |
| Kafka, clients Windows (profil kafka) | `127.0.0.1:9092` |
| Kafka, autres conteneurs (profil kafka) | `kafka:19092` |
| Redis | `127.0.0.1:6379` |
| Neo4j Browser / Bolt | <http://localhost:7474> / `127.0.0.1:7687` |
| UnoPim | <http://localhost:8000/admin> |
| Mailpit | <http://localhost:8025> |
| MinIO S3 | <http://127.0.0.1:9000> |
| Console MinIO | <http://127.0.0.1:9001> |
| Prometheus, profil monitoring | <http://127.0.0.1:9090> |
| Grafana, profil monitoring | <http://127.0.0.1:3000> |

Les mots de passe sont dans `.env`, jamais dans Git. Les ports sont liés à l'interface locale pour le développement.

## Organisation

Le scaffold suit les répertoires du §16 V3. Le fichier Compose racine reste le point d'entrée ; `infrastructure/compose/README.md` documente cette convention. Les fixtures catalogue gardent leur chemin `data/catalog/` et `data/mongodb/` réserve les schémas/imports MongoDB.

| Répertoire | Responsabilité |
| --- | --- |
| `data/contracts/` | Contrats OpenAPI, GraphQL et événements Kafka |
| `data/` | Fixtures, schémas PostgreSQL/MongoDB, contrats et emplacement seeds |
| `services/` | Auth, Orders, Inventory, Payments et Catalog GraphQL ; analytics et ai-assistant réservés |
| `workers/` | Product-sync et outbox-publisher ; invoice, notifications et log-retention réservés |
| `pipelines/` | Placeholders spark-streaming, spark-batch-quarterly, qualité et lakehouse |
| `frontend/src/` | Une application React : storefront, admin, clients API et composants partagés ; anciens répertoires features conservés |
| `infrastructure/` | Traefik, Prometheus, Grafana, OpenTelemetry et build MinIO |
| `tests/` | Tests unitaires et intégration ; contrats, e2e et acceptance réservés |
| `.github/workflows/` | Emplacement réservé aux futurs workflows |
| `docs/` | Architecture, ADR, dictionnaire, API et validation de démonstration |
| `scripts/` | Installation, démarrage, arrêt et vérification Windows |

## Vérifications du socle

```powershell
docker compose --env-file .env -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml ps
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
.\.venv\Scripts\python.exe -m pip check
```

Le vérificateur échoue avec un code non nul si un service requis est absent, arrêté, sans santé `healthy`, sans son volume attendu ou inaccessible. Il exécute une requête PostgreSQL authentifiée, un ping MongoDB authentifié, une requête Neo4j authentifiée et vérifie `/up` et la page de connexion UnoPim. Ces contrôles portent sur le socle technique ; les parcours métier et pipelines restent à valider séparément dans [le plan de validation](docs/demo-validation.md).

## Phase 2 : bases et données

Les migrations PostgreSQL, la validation MongoDB et le graphe Neo4j sont implémentés et chargés depuis `data/`. Les identifiants locaux sont lus et générés directement dans `.env`, ignoré par Git.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\initialize-data.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-data.ps1
```

Voir [les mappings, contrôles et limites Phase 2](docs/phase2-database-setup.md).

## Phase 3 : PIM et catalogue GraphQL

UnoPim gère maintenant les huit familles de composants et leurs attributs. Le worker publie uniquement les révisions approuvées dans MongoDB et Neo4j, avec contrôle des versions, journal durable et reprise sur erreur. Le catalogue GraphQL Strawberry est disponible via Traefik à <http://localhost:8080/graphql>.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-catalog.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-catalog.ps1
```

[Configuration, mapping, approbation et limites Phase 3](docs/phase3-catalogue.md). Les tests conservent un produit de vérification inactif et avancent les versions de publication sans modifier les fixtures sources.

## Phase 4 : backend transactionnel

Auth, Inventory, Orders et Payments sont exposés via Traefik sous `/api/auth`, `/api/inventory`, `/api/orders` et `/api/payments`. Le checkout utilise une Saga persistée, les paiements sont simulés et le publisher confirme la publication des outboxes uniquement après acquittement Kafka. GraphQL et UnoPim restent opérationnels.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-commerce.ps1 -WithKafka
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-commerce.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-commerce.ps1
```

Sans `-WithKafka`, les événements restent durablement en attente. Les identifiants de développement sont générés directement dans `.env`, ignoré par Git ; les comptes fixtures restent désactivés. [Architecture, endpoints, sécurité, reprise et limites](docs/phase4-commerce.md).

## Analytics — Phase 6

La page http://localhost:8080/admin/analytics expose les données matérialisées avec contrôle des rôles et fraîcheur explicite. Démarrer avec `scripts/start-analytics.ps1`, vérifier avec `scripts/verify-analytics.ps1`, tester les reprises avec `scripts/test-analytics.ps1 -WithRecovery`, et arrêter avec `scripts/stop-analytics.ps1`. Le backfill est en lecture seule ; les checkpoints et données Delta restent dans MinIO. Voir [architecture, commandes et limites](docs/phase6-analytics.md) et [résultats mesurés](docs/phase6-execution.md).
