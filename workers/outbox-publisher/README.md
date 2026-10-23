# Transactional outbox publisher

Entry point: python -m market_commerce.outbox. The implementation in market_commerce/outbox.py uses committed PostgreSQL claims and Kafka acknowledgement before marking publication. Delivery is at least once; a persisted verification inbox demonstrates duplicate handling. KAFKA_ENABLED=0 leaves events queued. See docs/phase4-commerce.md and the versioned event contract.
