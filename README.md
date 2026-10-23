# Market Hardware

Plateforme de pilotage d'un e-commerce de matériel informatique : commandes, catalogue, stock, paiements simulés, analytique et observabilité.

## État du dépôt

Le dépôt est initialisé avec l'arborescence du projet et l'infrastructure locale fonctionnelle : PostgreSQL 16, MongoDB 7, Kafka 4.1.2, Redis 7 et MinIO. Prometheus et Grafana sont disponibles via le profil optionnel `monitoring`.

Les services métier, le frontend, les contrats, les tables SQL, les données de démonstration, les pipelines et les tests applicatifs restent à développer. Les répertoires réservés sont suivis dans Git avec des fichiers `.gitkeep`.

La référence technique est [l'architecture du projet](docs/architecture/MARKET_HARDWARE_ARCHITECTURE.md). Les conventions de développement figurent dans [AGENTS.md](AGENTS.md).

## Démarrage local sous Windows

Prérequis : Docker Desktop avec conteneurs Linux, Git, Python 3.12, Node.js LTS et JDK 17.

```powershell
cd C:\market-hardware
# Crée .venv et installe les dépendances Python ; génère .env s'il est absent.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-market.ps1 -SkipPackages -SkipContainers
# Démarre les cinq services d'infrastructure.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
```

Pour installer aussi les outils Windows sur une nouvelle machine, omettre `-SkipPackages`. Le premier démarrage peut compiler MinIO depuis sa révision officielle épinglée ; l'image locale est ensuite réutilisée.

Ce dépôt reprend le nom Compose `market-hardware` et les volumes du dossier `C:\market-local-setup`. Sur cette machine, le fichier `.env` local existant a été repris et reste ignoré par Git. Il ne faut pas générer de nouveaux identifiants pour des volumes déjà initialisés.

Pour activer la supervision ou arrêter les services :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1 -WithMonitoring
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-market.ps1
```

L'arrêt conserve les volumes. Les fichiers SQL et MongoDB sont des points de départ pour le développement ; ils ne sont pas exécutés automatiquement au démarrage.

## Accès à l'infrastructure

| Service | Adresse locale |
| --- | --- |
| PostgreSQL | `127.0.0.1:5432`, base `market_db` |
| MongoDB | `127.0.0.1:27017`, catalogue prévu dans `market_catalog` |
| Kafka, clients Windows | `127.0.0.1:9092` |
| Kafka, autres conteneurs | `kafka:19092` |
| Redis | `127.0.0.1:6379` |
| MinIO S3 | <http://127.0.0.1:9000> |
| Console MinIO | <http://127.0.0.1:9001> |
| Prometheus, profil monitoring | <http://127.0.0.1:9090> |
| Grafana, profil monitoring | <http://127.0.0.1:3000> |

Les mots de passe sont dans `.env`, jamais dans Git. Les ports sont liés à l'interface locale pour le développement.

## Organisation

| Répertoire | Responsabilité |
| --- | --- |
| `contracts/` | Contrats OpenAPI, GraphQL et événements Kafka |
| `database/` | Schémas, tables, migrations, catalogue et génération de données |
| `services/` | Six services : orders, inventory, payments, catalog, auth et analytics |
| `eventing/` | Publisher outbox et générateur de clics |
| `pipelines/` | Batch, streaming, qualité et lakehouse |
| `frontend/src/features/` | Overview, orders, catalog, logistics et observability |
| `infrastructure/` | Traefik, Prometheus, Grafana, OpenTelemetry et build MinIO |
| `tests/` | Unitaires, contrats, intégration, E2E et reprise |
| `docs/` | Architecture, ADR, dictionnaire, API et validation de démonstration |
| `scripts/` | Installation, démarrage, arrêt et vérification Windows |

## Vérifications du socle

```powershell
docker compose --env-file .env.example -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml ps
.\.venv\Scripts\python.exe -m pip check
```

Ces vérifications portent sur le socle technique. Le scénario métier, les pipelines Spark/Delta et les critères de reprise doivent être implémentés et vérifiés séparément dans [le plan de validation](docs/demo-validation.md).
