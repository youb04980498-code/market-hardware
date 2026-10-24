# Phase 8 resilience

Existing durability mechanisms are preserved: local transactions, immutable purchase snapshots, reservation locks/constraints, checkout idempotency, persisted Saga leases/attempts, exponential retry delay capped at 60 seconds, refund/release compensation, Kafka acknowledgement before publication markers and retained Spark checkpoints. HTTP timeouts remain five seconds with a two-second connection bound. The remote helper never adds blind HTTP retries to commands; durable, independently idempotent Saga steps own business retries.

New per-target process-local circuit breakers open after five dependency failures, reject for 15 seconds, admit one HALF_OPEN probe and close on successful recovery. Only transport/5xx dependency failures trip the breaker; business rejections do not. A nonblocking eight-slot semaphore bounds concurrent requests per downstream dependency. Connection limits and database statement/lock timeouts provide further bounds. Circuits intentionally reset on process restart; business recovery remains persisted. These are local-process bulkheads, not a distributed concurrency limit.

Unit tests cover CLOSED/OPEN/HALF_OPEN/recovery, failed probes and rejected concurrent overflow. Commerce regression retains actual worker-crash and Kafka-ack recovery cases. Phase 8 adds an actual Analytics API/worker outage while storefront, catalogue and checkout continue. Failure tests always restore stopped services in finally; they do not remove volumes, reset offsets, delete checkpoints or rewrite financial history.

Structured HTTP technical logs are stored separately from business audit. The weekly retention worker has no business-table DELETE privilege and may only invoke a tightly scoped SECURITY DEFINER function that deletes application_logs older than seven days. Successful runs record start/end/count/status. A failed SQL transaction rolls back; the container logs the failure and restarts. Weekly scheduling is checked hourly; historical successful runs prevent a repeat purge within seven days. External trace/metric retention is separate.


Retention-aware import: after a successful technical purge, fixture replay does not recreate source application logs older than seven days. Commercial fixtures are still verified without overwriting stored values. Source CSV files remain tracked and unchanged. Snapshot canonicalization encodes SQL Decimal durations exactly as strings.


Long-running analytics acceptance tests obtain fresh credentials per test; the production JWT lifetime is not extended to accommodate recovery-suite duration. This keeps expired-token rejection distinct from positive authorization cases.
