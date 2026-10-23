CREATE OR REPLACE FUNCTION monitoring.guard_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed boolean := false;
BEGIN
 IF TG_TABLE_SCHEMA='orders' THEN
  IF OLD.status<>'PENDING' AND (NEW.total_cents,NEW.customer_id,NEW.currency,NEW.auth_user_id,NEW.checkout_key)
   IS DISTINCT FROM (OLD.total_cents,OLD.customer_id,OLD.currency,OLD.auth_user_id,OLD.checkout_key) THEN
   RAISE EXCEPTION 'Confirmed order values are immutable' USING ERRCODE='23514';
  END IF;
  allowed := (OLD.status='PENDING' AND NEW.status IN ('STOCK_RESERVED','PAID','PAYMENT_FAILED','CANCELLED'))
   OR (OLD.status='STOCK_RESERVED' AND NEW.status IN ('PAID','PAYMENT_FAILED','CANCELLED','REFUNDED'))
   OR (OLD.status='PAID' AND NEW.status IN ('SHIPPED','REFUNDED'))
   OR (OLD.status='SHIPPED' AND NEW.status IN ('DELIVERED','REFUNDED'))
   OR (OLD.status='DELIVERED' AND NEW.status='REFUNDED');
  NEW.updated_at:=now();
 ELSE
  IF (NEW.amount_cents,NEW.order_id,NEW.idempotency_key,NEW.currency,NEW.owner_user_id)
   IS DISTINCT FROM (OLD.amount_cents,OLD.order_id,OLD.idempotency_key,OLD.currency,OLD.owner_user_id) THEN
   RAISE EXCEPTION 'Payment identity and amount are immutable' USING ERRCODE='23514';
  END IF;
  allowed := (OLD.status='PENDING' AND NEW.status IN ('SUCCEEDED','FAILED')) OR (OLD.status='SUCCEEDED' AND NEW.status='REFUNDED');
 END IF;
 IF NEW.status<>OLD.status AND NOT allowed THEN RAISE EXCEPTION 'Invalid status transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION orders.guard_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
 SELECT status INTO current_status FROM orders.orders
  WHERE order_id=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END FOR UPDATE;
 IF NOT monitoring.snapshot_seed() AND current_status IS NOT NULL AND current_status<>'PENDING' THEN
  RAISE EXCEPTION 'Confirmed order lines are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.order_id,NEW.product_id,NEW.unit_price_cents,NEW.sku,NEW.product_name,NEW.currency,NEW.publication_version,NEW.warehouse_id)
  IS DISTINCT FROM (OLD.order_id,OLD.product_id,OLD.unit_price_cents,OLD.sku,OLD.product_name,OLD.currency,OLD.publication_version,OLD.warehouse_id) THEN
  RAISE EXCEPTION 'Order line snapshot is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION payments.guard_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE captured bigint; used bigint; state text;
BEGIN
 SELECT amount_cents,status INTO captured,state FROM payments.payments WHERE payment_id=NEW.payment_id FOR UPDATE;
 IF state NOT IN ('SUCCEEDED','REFUNDED') THEN RAISE EXCEPTION 'Only captured payments can be refunded' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.payment_id,NEW.amount_cents,NEW.idempotency_key,NEW.request_hash) IS DISTINCT FROM
     (OLD.payment_id,OLD.amount_cents,OLD.idempotency_key,OLD.request_hash) THEN
   RAISE EXCEPTION 'Refund identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status AND NOT ((OLD.status='PENDING' AND NEW.status IN ('SUCCEEDED','FAILED')) OR
     (OLD.status='FAILED' AND NEW.status='PENDING')) THEN
   RAISE EXCEPTION 'Invalid refund transition' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT coalesce(sum(amount_cents),0) INTO used FROM payments.refunds
 WHERE payment_id=NEW.payment_id AND status IN ('PENDING','SUCCEEDED') AND refund_id<>NEW.refund_id;
 IF NEW.status IN ('PENDING','SUCCEEDED') AND used+NEW.amount_cents>captured THEN
  RAISE EXCEPTION 'Refund exceeds captured amount' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refund_guard BEFORE INSERT OR UPDATE ON payments.refunds FOR EACH ROW EXECUTE FUNCTION payments.guard_refund();
REVOKE ALL ON FUNCTION payments.guard_refund() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payments.guard_refund() TO market_payments;

CREATE OR REPLACE FUNCTION monitoring.emit_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_kind text; aggregate text; aggregate_kind text; correlation uuid; cause uuid; idem text; body jsonb;
BEGIN
 IF monitoring.snapshot_seed() THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
 aggregate_kind:=CASE TG_TABLE_NAME WHEN 'orders' THEN 'order' WHEN 'payments' THEN 'payment' ELSE 'reservation' END;
 aggregate:=CASE TG_TABLE_NAME WHEN 'orders' THEN NEW.order_id::text WHEN 'payments' THEN NEW.payment_id::text ELSE NEW.reservation_id::text END;
 event_kind:=CASE TG_TABLE_NAME
  WHEN 'orders' THEN CASE WHEN TG_OP='INSERT' THEN 'order.created' WHEN NEW.status='PAID' THEN 'order.confirmed'
   WHEN NEW.status='PAYMENT_FAILED' THEN 'order.failed' ELSE 'order.'||lower(NEW.status) END
  WHEN 'payments' THEN 'payment.'||lower(NEW.status)
  ELSE CASE NEW.status WHEN 'ACTIVE' THEN 'inventory.reserved' WHEN 'RELEASED' THEN 'inventory.reservation_released' ELSE 'inventory.committed' END END;
 correlation:=coalesce(nullif(current_setting('market.correlation_id',true),'')::uuid,gen_random_uuid());
 cause:=nullif(current_setting('market.causation_id',true),'')::uuid;
 idem:=nullif(current_setting('market.idempotency_key',true),'');
 body:=to_jsonb(NEW)-'simulation'-'checkout_key'-'owner_user_id'-'auth_user_id';
 EXECUTE format('INSERT INTO %I.outbox_events(event_id,event_type,event_version,aggregate_id,aggregate_type,payload,correlation_id,causation_id,idempotency_key,occurred_at) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,now())',TG_TABLE_SCHEMA)
 USING gen_random_uuid(),event_kind,aggregate,aggregate_kind,body,correlation,cause,idem;
 RETURN NEW;
END $$;
