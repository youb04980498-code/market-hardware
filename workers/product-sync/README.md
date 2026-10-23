# Product synchronization

Entry point: python -m market_catalog.sync (poll) or python -m market_catalog.sync --once.
The shared market_catalog/pim.py, sync.py and graph.py implement UnoPim REST mapping, approval checks,
durable jobs, stale-revision rejection, retries and explicit compatibility predicates.
The root Compose catalog profile runs this worker locally; it does not need Kafka.
See ../../docs/phase3-catalogue.md for authoring, approval, recovery and verification commands.
