# Phase 8 backup and isolated recovery

```powershell
.\.venv\Scripts\python.exe scripts/backup-platform.py
.\.venv\Scripts\python.exe scripts/backup-platform.py --restore-isolated
```

Artifacts under ignored `.local/backups/<UTC-id>/` contain private data and must remain local. PostgreSQL uses a consistent exported REPEATABLE READ snapshot shared with pg_dump and expected table counts. Restore creates a new uniquely named database, never overwrites market_db and compares every dumped table count. MongoDB uses mongodump archive/gzip and restores into a new namespace; all product documents excluding Mongo's surrogate _id are compared. Neo4j exports labels, properties and relationship endpoints/type/properties, then recreates them in an isolated container and checks node/relationship counts. The isolated graph container is stopped after verification and kept for inspection. MinIO snapshots every object into local files with SHA256, restores under a new bucket and verifies every recovered object checksum.

An object-store export is not a cluster-wide atomic point-in-time snapshot while the writer is active. For a coordinated disaster-recovery backup, stop only analytics-worker, allow transactions/Sagas to settle, export, then restart the worker. Store Kafka data volume and all checkpoint/object-store data together; a new broker without old topic offsets cannot safely resume the old checkpoint. The script never resets Kafka or compensates missing offsets automatically. The script also exports the PIM PostgreSQL database and copies root/PIM configuration into the private ignored backup directory. PIM credentials must remain local. The PIM backup was executed; an isolated PIM restore was not part of the four-store rehearsal.

Actual first restore on 2026-10-24: all four PASS in 173.359 seconds; 43 catalogue products, 43 graph nodes, 163 graph relationships and 3,702 MinIO objects (33,051,181 bytes). The local report preserves exact isolated target names and PostgreSQL per-table counts. These are local recovery measurements, not a guaranteed production RTO/RPO. No invoice PDF workflow exists yet, so restoration of a generated commercial invoice PDF cannot be claimed.

Delta version reads and isolated materialization are separately exercised by `scripts/check-lakehouse-operations.py`, without RESTORE on a live table. Live query plans are captured read-only, with a before/after index comparison on a disposable session-local table, by `scripts/check-query-plans.py`. Small demonstration datasets may use sequential scans; no unsupported performance improvement is claimed. Existing commercial tables are not repartitioned. Future large technical logs should use weekly range partitions with the same seven-day retention guard; bounded current volume is served by created_at/service/trace indexes. Kafka partitions and event-time window state are independent of SQL partitioning.


Retention-aware import: after a successful technical purge, fixture replay does not recreate source application logs older than seven days. Commercial fixtures are still verified without overwriting stored values. Source CSV files remain tracked and unchanged. Snapshot canonicalization encodes SQL Decimal durations exactly as strings.
