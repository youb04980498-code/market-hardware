# UnoPim infrastructure

The root Compose file includes this upstream UnoPim definition. All services run in the `market-hardware` stack, with a dedicated PIM PostgreSQL database, Redis, Elasticsearch, application, queue worker, scheduler and Mailpit.

Upstream source: https://github.com/unopim/unopim/blob/3.x/compose.yaml

Local credentials are in the ignored `.env` here. Before starting on a fresh checkout, copy `.env.example` to `.env` and replace the database password with a generated secret.

UnoPim: http://localhost:8000/admin (use this hostname to match APP_URL)
Mailpit: http://localhost:8025

Generated administrator credentials are saved locally in `.local/unopim-admin-credentials.txt` at the project root and ignored by Git. Images are pinned by digest to the versions installed during setup.

Start from the project root with `docker compose up -d`. First startup downloads images and initializes the separate PIM database. Installation does not implement publication into the commerce catalog or compatibility graph.
