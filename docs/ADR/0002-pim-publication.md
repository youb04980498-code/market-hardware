# ADR 0002: PIM-owned revisions and replayable catalogue projections

Status: implemented for local Phase 3.

UnoPim's installed REST API supports the required product/configuration operations. V3 fixture source_version values are opaque strings; they cannot safely be compared lexicographically. The Phase 2 databases already contain an approved historical snapshot and must retain their stable IDs and data.

Store an explicit monotonic source_revision alongside the original source_version. Approval binds the complete validated product content and revisions with a deterministic hash in supported PIM attributes. Use a MongoDB durable publication journal and serialized worker without requiring Kafka. Keep source and projection publication versions distinct fields but require both to advance for updates. Future event adapters can deliver the same approved snapshot to the worker boundary.

Expose only READY projections. Update Neo4j in one transaction, invalidate incident edges, and revalidate explicit fixture candidates with endpoint versions. On partial failure prefer temporarily unavailable product data to falsely consistent compatibility. Preserve failed jobs for retry; retain invalid edges for provenance. There is no distributed transaction or claim of full-build correctness.

After adoption by the worker, Phase 2 fixture loading becomes insert-only for those products; it cannot reclaim projection ownership. Regression tests distinguish immutable source snapshots from later PIM revisions. The V3 specification and tracked source fixture contents are unchanged.
