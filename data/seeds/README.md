# Phase 2 importer

Run scripts/initialize-data.ps1 from the repository root. phase2.py reads the tracked files directly under data/; no ZIP is used. It applies checksum-verified migrations, configures MongoDB validation/indexes, imports PostgreSQL, MongoDB and Neo4j, and preserves existing rows. Conflicting existing records fail without replacement. Credentials are read/generated directly in the ignored root .env.

Actions: .venv/Scripts/python.exe data/seeds/phase2.py all (or migrate, seed).
See ../../docs/phase2-database-setup.md for mappings and limits.
