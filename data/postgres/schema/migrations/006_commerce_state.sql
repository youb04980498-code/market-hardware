-- Additive Phase 4 state; existing business rows and lifecycle names are preserved.
ALTER TABLE auth.users ADD COLUMN email text;
ALTER TABLE auth.users ADD COLUMN first_name text NOT NULL DEFAULT '';
ALTER TABLE auth.users ADD COLUMN last_name text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX auth_email_unique ON auth.users(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE auth.refresh_sessions (
 session_id uuid PRIMARY KEY, family_id uuid NOT NULL, user_id bigint NOT NULL REFERENCES auth.users(user_id),
 token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, rotated_to uuid
);
CREATE INDEX refresh_family_idx ON auth.refresh_sessions(family_id);
CREATE INDEX refresh_user_idx ON auth.refresh_sessions(user_id);
CREATE TABLE auth.rate_limits (bucket text PRIMARY KEY, window_start bigint NOT NULL, hits integer NOT NULL CHECK(hits>0));

ALTER TABLE orders.customers ADD COLUMN auth_user_id bigint UNIQUE;
ALTER TABLE orders.orders ADD COLUMN auth_user_id bigint;
ALTER TABLE orders.orders ADD COLUMN currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$');
ALTER TABLE orders.orders ADD COLUMN checkout_key text;
CREATE UNIQUE INDEX checkout_idempotency ON orders.orders(auth_user_id,checkout_key) WHERE checkout_key IS NOT NULL;
ALTER TABLE orders.order_items ADD COLUMN sku text;
ALTER TABLE orders.order_items ADD COLUMN product_name text;
ALTER TABLE orders.order_items ADD COLUMN currency text NOT NULL DEFAULT 'EUR';
ALTER TABLE orders.order_items ADD COLUMN publication_version bigint;
ALTER TABLE orders.order_items ADD COLUMN warehouse_id bigint;
CREATE TABLE orders.checkout_requests (
 user_id bigint NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL,
 order_id bigint NOT NULL UNIQUE REFERENCES orders.orders(order_id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,idempotency_key)
);
CREATE TABLE orders.sagas (
 order_id bigint PRIMARY KEY REFERENCES orders.orders(order_id),
 step text NOT NULL CHECK(step IN ('RESERVE','PAY','FINALIZE','RELEASE','REFUND','REFUND_RELEASE','DONE')),
 correlation_id uuid NOT NULL, payment_id bigint, cancel_requested boolean NOT NULL DEFAULT false,
 failure_code text, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_owner uuid, lease_until timestamptz,
 simulation text NOT NULL DEFAULT 'success', fault text, fault_consumed boolean NOT NULL DEFAULT false,
 reservation_ttl integer NOT NULL DEFAULT 900 CHECK(reservation_ttl>0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saga_due_idx ON orders.sagas(next_attempt_at) WHERE step<>'DONE';
CREATE TABLE orders.test_plans (
 user_id bigint NOT NULL, idempotency_key text NOT NULL,
 simulation text NOT NULL, fault text, reservation_ttl integer NOT NULL DEFAULT 900,
 PRIMARY KEY(user_id,idempotency_key)
);
CREATE TABLE inventory.adjustments (
 adjustment_id uuid PRIMARY KEY, request_hash text NOT NULL, product_id bigint NOT NULL,
 warehouse_id bigint NOT NULL, delta integer NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(product_id,warehouse_id) REFERENCES inventory.stock(product_id,warehouse_id)
);
ALTER TABLE inventory.reservations ADD COLUMN expires_at timestamptz;
CREATE INDEX reservation_expiry_idx ON inventory.reservations(expires_at) WHERE status='ACTIVE' AND expires_at IS NOT NULL;
ALTER TABLE payments.payments ADD COLUMN currency text NOT NULL DEFAULT 'EUR';
ALTER TABLE payments.payments ADD COLUMN owner_user_id bigint;
ALTER TABLE payments.payments ADD COLUMN simulation text NOT NULL DEFAULT 'success';
ALTER TABLE payments.payments ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0);
-- Preserve historical retries: uniqueness applies to newly owned commerce payments only.
CREATE UNIQUE INDEX commerce_payment_order ON payments.payments(order_id) WHERE owner_user_id IS NOT NULL;
CREATE TABLE payments.payment_attempts (
 attempt_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 payment_id bigint NOT NULL REFERENCES payments.payments(payment_id), attempt integer NOT NULL,
 outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(payment_id,attempt)
);
CREATE TABLE payments.refunds (
 refund_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 payment_id bigint NOT NULL REFERENCES payments.payments(payment_id), idempotency_key text NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0), request_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('PENDING','SUCCEEDED','FAILED')),
 attempts integer NOT NULL DEFAULT 0, notify_pending boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(payment_id,idempotency_key)
);
CREATE TABLE payments.financial_audit (
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, payment_id bigint NOT NULL REFERENCES payments.payments(payment_id),
 operation text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(operation,reference)
);

DO $migration$
DECLARE s text;
BEGIN
 FOREACH s IN ARRAY ARRAY['auth','orders','inventory','payments'] LOOP
  EXECUTE format('ALTER TABLE %I.outbox_events
   ADD COLUMN aggregate_type text NOT NULL DEFAULT ''legacy'',
   ADD COLUMN causation_id uuid, ADD COLUMN idempotency_key text,
   ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 0,
   ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
   ADD COLUMN claim_owner uuid, ADD COLUMN claim_until timestamptz,
   ADD COLUMN last_error text, ADD COLUMN kafka_partition integer, ADD COLUMN kafka_offset bigint',s);
 END LOOP;
END $migration$;
CREATE TABLE monitoring.consumer_inbox (
 consumer_name text NOT NULL, event_id uuid NOT NULL, event_type text NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(consumer_name,event_id)
);
CREATE TABLE monitoring.worker_status (worker_name text PRIMARY KEY, checked_at timestamptz NOT NULL DEFAULT now(), state text NOT NULL);
REVOKE ALL ON ALL TABLES IN SCHEMA auth,orders,inventory,payments,monitoring FROM PUBLIC;
DO $permissions$
DECLARE s text;
BEGIN
 FOREACH s IN ARRAY ARRAY['auth','orders','inventory','payments'] LOOP
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA %I TO %I',s,'market_'||s);
  EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I',s,'market_'||s);
 END LOOP;
END $permissions$;
-- Financial history is append-only to the Payments runtime role.
REVOKE UPDATE ON payments.financial_audit FROM market_payments;
DO $role$
BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='market_outbox') THEN CREATE ROLE market_outbox NOLOGIN; END IF;
END $role$;
DO $publisher$
DECLARE s text;
BEGIN
 FOREACH s IN ARRAY ARRAY['auth','orders','inventory','payments'] LOOP
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO market_outbox',s);
  EXECUTE format('GRANT SELECT ON %I.outbox_events TO market_outbox',s);
  EXECUTE format('GRANT UPDATE(published_at,delivery_attempts,next_attempt_at,claim_owner,claim_until,last_error,kafka_partition,kafka_offset) ON %I.outbox_events TO market_outbox',s);
 END LOOP;
END $publisher$;
GRANT USAGE ON SCHEMA monitoring TO market_outbox;
GRANT SELECT,INSERT,UPDATE ON monitoring.worker_status TO market_outbox;
GRANT SELECT,INSERT ON monitoring.consumer_inbox TO market_outbox;
