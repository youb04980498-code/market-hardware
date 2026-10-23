# Analytics API and worker

Runtime code is in market_analytics/. Both containers use the pinned pipelines/lakehouse/Dockerfile image. Only the worker starts Spark. The API reads immutable materialized releases in the separate market_analytics PostgreSQL database and validates active staff sessions through Auth. It has no source database or S3 credentials.

Run scripts/start-analytics.ps1, verify-analytics.ps1 and test-analytics.ps1 -WithRecovery from the project root. Queue jobs using backfill-analytics.ps1 and run-quarterly-analytics.ps1 -Year 2025 -Quarter 1. Stop only analytics with stop-analytics.ps1. See docs/phase6-analytics.md, phase6-kpi-definitions.md and phase6-recovery.md. Never reset checkpoints, Kafka offsets or volumes.
