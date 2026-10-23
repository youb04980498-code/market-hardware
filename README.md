# Market Hardware

Plateforme de pilotage d'un e-commerce de matériel informatique : commandes, catalogue, stock, paiements simulés, analytique et observabilité.

## État du dépôt

Le dépôt suit le scaffold V3. L'infrastructure locale comprend PostgreSQL 16, MongoDB 7, Neo4j et UnoPim avec sa base dédiée, Redis, Elasticsearch, queue worker, scheduler et Mailpit. Les services de données utilisent des volumes persistants. Les vérifications de santé sont obligatoires pour PostgreSQL, MongoDB, Neo4j et tous les services UnoPim. Redis et MinIO du socle initial restent disponibles. Kafka est différé sous le profil optionnel `kafka` ; Prometheus et Grafana utilisent `monitoring`.

Les sources de données synthétiques sont suivies dans Git sous `data/`. Les services métier, le frontend, l'IA, les contrats applicatifs, les tables SQL et les pipelines restent à implémenter. Les répertoires réservés sont suivis avec `.gitkeep` ; leur présence ne signifie pas qu'une application est développée.

La référence fonctionnelle et technique est le [cahier des charges V3](docs/MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md). Ses exigences MUST et critères AC-01 à AC-27 définissent la cible à implémenter et à valider. L'[architecture V1](docs/architecture/MARKET_HARDWARE_ARCHITECTURE.md) est conservée comme historique ; la V3 prévaut en cas de divergence. Les conventions de développement figurent dans [AGENTS.md](AGENTS.md).

La cible V3 comprend aussi Ollama/Qwen, la synchronisation produit, les workers métier de facturation/notification, le batch trimestriel et la purge hebdomadaire des logs techniques âgés de plus de 7 jours. Ces flux applicatifs restent à implémenter. Aucun service frontend, IA ou Spark n'est démarré à cette étape.

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

L'arrêt conserve les volumes. Le démarrage par défaut arrête un éventuel Kafka existant sans supprimer son volume. Les fichiers SQL et MongoDB sous `data/postgres/schema/` et `data/mongodb/schema/` sont des points de départ ; ils ne sont pas exécutés automatiquement. GitHub conserve le code, les fixtures et la documentation ; l'exécution, les secrets et les bases restent locaux.

## Accès à l'infrastructure

Neo4j et la pile UnoPim sont maintenant déclarés dans le Compose racine. UnoPim utilise sa propre base PostgreSQL, Redis, Elasticsearch, workers et Mailpit. La publication vers MongoDB/Neo4j reste à implémenter. Les identifiants administrateur générés sont conservés localement dans `.local/unopim-admin-credentials.txt` (ignoré par Git).

| Service | Adresse locale |
| --- | --- |
| PostgreSQL | `127.0.0.1:5432`, base `market_db` |
| MongoDB | `127.0.0.1:27017`, catalogue prévu dans `market_catalog` |
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
| `services/` | Placeholders auth, orders, inventory, payments, catalog-graphql, analytics et ai-assistant |
| `workers/` | Placeholders product-sync, outbox-publisher, invoice, notifications et log-retention |
| `pipelines/` | Placeholders spark-streaming, spark-batch-quarterly, qualité et lakehouse |
| `frontend/src/features/` | Overview, orders, catalog, logistics et observability |
| `infrastructure/` | Traefik, Prometheus, Grafana, OpenTelemetry et build MinIO |
| `tests/` | Placeholders unit, contracts, integration, e2e et acceptance |
| `.github/workflows/` | Emplacement réservé aux futurs workflows |
| `docs/` | Architecture, ADR, dictionnaire, API et validation de démonstration |
| `scripts/` | Installation, démarrage, arrêt et vérification Windows |

## Vérifications du socle

```powershell
docker compose --env-file .env.example -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml ps
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
.\.venv\Scripts\python.exe -m pip check
```

Le vérificateur échoue avec un code non nul si un service requis est absent, arrêté, sans santé `healthy`, sans son volume attendu ou inaccessible. Il exécute une requête PostgreSQL authentifiée, un ping MongoDB authentifié, une requête Neo4j authentifiée et vérifie `/up` et la page de connexion UnoPim. Ces contrôles portent sur le socle technique ; les parcours métier et pipelines restent à valider séparément dans [le plan de validation](docs/demo-validation.md).
