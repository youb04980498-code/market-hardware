CREATE TABLE orders.saga_attempts (
 attempt_id uuid PRIMARY KEY, order_id bigint NOT NULL REFERENCES orders.sagas(order_id),
 step text NOT NULL, outcome text NOT NULL DEFAULT 'STARTED', created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX saga_attempt_order_idx ON orders.saga_attempts(order_id,created_at);
REVOKE ALL ON orders.saga_attempts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON orders.saga_attempts TO market_orders;
