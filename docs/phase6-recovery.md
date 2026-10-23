# Phase 6 failure recovery

Never delete Delta logs, checkpoint directories, Kafka topics, serving releases or Docker volumes to recover. Restore the failed dependency and restart only analytics-worker. The last complete serving version remains readable. A source/S3 error marks the pipeline ERROR; elapsed verification age also marks data stale. Kafka lag is timestamped independently of source snapshot freshness.

| Failure | Durable behavior and action |
| --- | --- |
| Driver exits during Bronze write | Delta transaction is atomic; checkpoint batch retries and MERGE on topic/partition/offset prevents duplicate transport rows |
| Driver exits after Delta but before checkpoint commit | Same batch replays; business UUID dedup and immutable release MERGE prevent financial inflation |
| Driver exits before serving pointer commit | PostgreSQL transaction rolls back; complete prior pointer remains; queued RUNNING technical job is recovered on restart |
| Kafka unavailable | Checkout stays available; outboxes retain/retry; Spark retries/fails and resumes retained checkpoint after broker recovery |
| MinIO unavailable | No partial Delta/serving release is published; worker records ERROR when bounded SDK retry fails and restarts; prior serving results stay visible as stale |
| Source or catalogue unavailable | Prior release remains, no invented replacement classifications or financial values are published |
| Bad JSON/version/UTF8 | Persist original bytes in Bronze, quarantine with bounded error code; other valid records continue |
| Same UUID, changed payload | Mark identity conflicting, retain all raw copies and invalidate curated business notification |
| Late/out-of-order event | Retain event time and late flag; reconcile authoritative state without reverting it |
| Partial/full refund after report | Reconcile snapshot, rerun original quarter; publish a new report version, retain original |
| Second writer | PostgreSQL advisory lock refuses it; manual jobs must queue through the running owner |

`scripts/stop-analytics.ps1` stops only the two analytics services. `scripts/start-analytics.ps1` restores the same persisted bucket/checkpoint/serving data. Do not start multiple driver containers or use another Delta writer. `ANALYTICS_TESTING=1` enables local CLI-only one-shot interruption controls; the HTTP API has no mutation or fault endpoint. Set it to 0 and recreate analytics-worker to disable fault submission. Fault flags are consumed before process exit, so the same queued job can recover safely.

Health means the API has a complete readable version and the worker has a recent successful verification. A health check alone proves neither reconciliation nor Kafka progress; inspect `/pipeline/status`, its timestamps and the release's reconciliation. Use scripts/verify-analytics.ps1 for actual source comparisons and authorization checks. Run `scripts/test-analytics.ps1 -WithRecovery` for intentional outages and recovery tests when no other test suite is changing financial totals.

The current design has no distributed multiwriter S3 transaction service, CDC log retention policy, or multi-host failover. Checkpoints require retained Kafka offsets; `failOnDataLoss=true` fails visibly if offsets have expired. Back up MinIO and PostgreSQL together for disaster recovery. Restoring arbitrary inconsistent backup points is not claimed or tested.
