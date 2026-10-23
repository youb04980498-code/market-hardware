CREATE FUNCTION monitoring.snapshot_seed() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(current_setting('market.seed_snapshot', true),'') = 'on'
 AND current_user = (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())
$$;

CREATE FUNCTION orders.check_order_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid bigint; expected numeric; actual bigint;
BEGIN
 oid := CASE WHEN TG_TABLE_NAME='orders' THEN NEW.order_id ELSE coalesce(NEW.order_id,OLD.order_id) END;
 SELECT total_cents INTO actual FROM orders.orders WHERE order_id=oid;
 SELECT coalesce(sum(quantity::numeric * unit_price_cents),0) INTO expected FROM orders.order_items WHERE order_id=oid;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Order total does not match its lines' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_total AFTER INSERT OR UPDATE ON orders.orders
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION orders.check_order_total();
CREATE CONSTRAINT TRIGGER item_total AFTER INSERT OR UPDATE OR DELETE ON orders.order_items
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION orders.check_order_total();

CREATE FUNCTION monitoring.guard_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed boolean := false;
BEGIN
 IF TG_TABLE_SCHEMA='orders' THEN
  IF OLD.status <> 'PENDING' AND (NEW.total_cents <> OLD.total_cents OR NEW.customer_id <> OLD.customer_id) THEN
   RAISE EXCEPTION 'Confirmed order values are immutable' USING ERRCODE='23514';
  END IF;
  allowed := (OLD.status='PENDING' AND NEW.status IN ('STOCK_RESERVED','PAID','PAYMENT_FAILED','CANCELLED'))
   OR (OLD.status='STOCK_RESERVED' AND NEW.status IN ('PAID','PAYMENT_FAILED','CANCELLED'))
   OR (OLD.status='PAID' AND NEW.status IN ('SHIPPED','REFUNDED'))
   OR (OLD.status='SHIPPED' AND NEW.status IN ('DELIVERED','REFUNDED'))
   OR (OLD.status='DELIVERED' AND NEW.status='REFUNDED');
  NEW.updated_at := now();
 ELSE
  IF NEW.amount_cents<>OLD.amount_cents OR NEW.order_id<>OLD.order_id OR NEW.idempotency_key<>OLD.idempotency_key THEN
   RAISE EXCEPTION 'Payment identity and amount are immutable' USING ERRCODE='23514';
  END IF;
  allowed := (OLD.status='PENDING' AND NEW.status IN ('SUCCEEDED','FAILED')) OR (OLD.status='SUCCEEDED' AND NEW.status='REFUNDED');
 END IF;
 IF NEW.status<>OLD.status AND NOT allowed THEN RAISE EXCEPTION 'Invalid status transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_status BEFORE UPDATE ON orders.orders FOR EACH ROW EXECUTE FUNCTION monitoring.guard_status();
CREATE TRIGGER payment_status BEFORE UPDATE ON payments.payments FOR EACH ROW EXECUTE FUNCTION monitoring.guard_status();

CREATE FUNCTION orders.guard_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.order_id<>OLD.order_id OR NEW.product_id<>OLD.product_id OR NEW.unit_price_cents<>OLD.unit_price_cents THEN
  RAISE EXCEPTION 'Order line identity and purchase price are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER item_price BEFORE UPDATE ON orders.order_items FOR EACH ROW EXECUTE FUNCTION orders.guard_item_snapshot();

CREATE FUNCTION inventory.reserve_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Reservation must begin ACTIVE' USING ERRCODE='23514'; END IF;
  UPDATE inventory.stock SET reserved_quantity=reserved_quantity+NEW.quantity,updated_at=now()
   WHERE product_id=NEW.product_id AND warehouse_id=NEW.warehouse_id AND quantity-reserved_quantity >= NEW.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient available stock' USING ERRCODE='23514'; END IF;
 ELSE
  IF (NEW.order_id,NEW.product_id,NEW.warehouse_id,NEW.quantity) IS DISTINCT FROM (OLD.order_id,OLD.product_id,OLD.warehouse_id,OLD.quantity) THEN
   RAISE EXCEPTION 'Reservation identity and quantity are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.status<>OLD.status THEN
   IF OLD.status<>'ACTIVE' OR NEW.status NOT IN ('RELEASED','COMMITTED') THEN RAISE EXCEPTION 'Invalid reservation transition' USING ERRCODE='23514'; END IF;
   UPDATE inventory.stock SET reserved_quantity=reserved_quantity-OLD.quantity,
    quantity=quantity-CASE WHEN NEW.status='COMMITTED' THEN OLD.quantity ELSE 0 END,updated_at=now()
    WHERE product_id=OLD.product_id AND warehouse_id=OLD.warehouse_id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reserve_stock BEFORE INSERT OR UPDATE ON inventory.reservations FOR EACH ROW EXECUTE FUNCTION inventory.reserve_stock();

CREATE FUNCTION inventory.check_reserved() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid bigint; wid bigint; actual bigint; expected bigint;
BEGIN
 pid:=NEW.product_id; wid:=NEW.warehouse_id;
 SELECT reserved_quantity INTO actual FROM inventory.stock WHERE product_id=pid AND warehouse_id=wid;
 SELECT coalesce(sum(quantity),0) INTO expected FROM inventory.reservations WHERE product_id=pid AND warehouse_id=wid AND status='ACTIVE';
 IF actual<>expected THEN RAISE EXCEPTION 'Reserved stock must equal active reservations' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_reserved AFTER INSERT OR UPDATE ON inventory.stock
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory.check_reserved();
CREATE CONSTRAINT TRIGGER reservation_reserved AFTER INSERT OR UPDATE ON inventory.reservations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory.check_reserved();

CREATE FUNCTION inventory.guard_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid bigint; capacity bigint; used bigint;
BEGIN
 wid:=NEW.warehouse_id;
 -- A shared warehouse row lock serializes concurrent inserts of distinct products.
 SELECT capacity_units INTO capacity FROM inventory.warehouses WHERE warehouse_id=wid FOR UPDATE;
 IF TG_TABLE_NAME='warehouses' THEN capacity:=NEW.capacity_units; END IF;
 SELECT coalesce(sum(quantity),0) INTO used FROM inventory.stock WHERE warehouse_id=wid;
 IF TG_TABLE_NAME='stock' THEN used:=used+NEW.quantity-CASE WHEN TG_OP='UPDATE' THEN OLD.quantity ELSE 0 END; END IF;
 IF used>capacity THEN RAISE EXCEPTION 'Warehouse capacity exceeded' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='stock' THEN NEW.updated_at:=now(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_capacity BEFORE INSERT OR UPDATE ON inventory.stock FOR EACH ROW EXECUTE FUNCTION inventory.guard_capacity();
CREATE TRIGGER warehouse_capacity BEFORE UPDATE ON inventory.warehouses FOR EACH ROW EXECUTE FUNCTION inventory.guard_capacity();

CREATE FUNCTION payments.check_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invalid boolean;
BEGIN
 SELECT EXISTS(SELECT 1 FROM payments.invoices i JOIN payments.payments p USING(payment_id)
  WHERE p.status NOT IN ('SUCCEEDED','REFUNDED') OR i.order_id<>p.order_id OR i.total_cents<>p.amount_cents) INTO invalid;
 IF invalid THEN RAISE EXCEPTION 'Invoice must match an eligible payment' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_payment AFTER INSERT OR UPDATE ON payments.invoices
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payments.check_invoice();
CREATE CONSTRAINT TRIGGER payment_invoice AFTER UPDATE ON payments.payments
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payments.check_invoice();

CREATE FUNCTION monitoring.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO monitoring.business_audit(table_name,operation,record_id,old_status,new_status,transaction_id)
 VALUES(TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,TG_OP,
 coalesce(to_jsonb(NEW)->>'order_id',to_jsonb(NEW)->>'payment_id',to_jsonb(NEW)->>'reservation_id'),
 CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>'status' ELSE NULL END,to_jsonb(NEW)->>'status',txid_current());
 RETURN NEW;
END $$;

CREATE FUNCTION monitoring.emit_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_kind text; aggregate text; correlation uuid;
BEGIN
 IF monitoring.snapshot_seed() THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
 aggregate := coalesce(to_jsonb(NEW)->>'order_id',to_jsonb(NEW)->>'payment_id');
 event_kind := CASE TG_TABLE_NAME
  WHEN 'orders' THEN CASE WHEN TG_OP='INSERT' THEN 'order.created' ELSE 'order.'||lower(NEW.status) END
  WHEN 'payments' THEN 'payment.'||lower(NEW.status)
  ELSE CASE NEW.status WHEN 'ACTIVE' THEN 'inventory.reserved' WHEN 'RELEASED' THEN 'inventory.reservation_released' ELSE 'inventory.committed' END END;
 correlation := coalesce(nullif(current_setting('market.correlation_id',true),'')::uuid,gen_random_uuid());
 EXECUTE format('INSERT INTO %I.outbox_events(event_id,event_type,event_version,aggregate_id,payload,correlation_id,occurred_at) VALUES($1,$2,1,$3,$4,$5,now())',TG_TABLE_SCHEMA)
 USING gen_random_uuid(),event_kind,aggregate,to_jsonb(NEW),correlation;
 RETURN NEW;
END $$;
CREATE TRIGGER order_audit AFTER INSERT OR UPDATE ON orders.orders FOR EACH ROW EXECUTE FUNCTION monitoring.audit_change();
CREATE TRIGGER payment_audit AFTER INSERT OR UPDATE ON payments.payments FOR EACH ROW EXECUTE FUNCTION monitoring.audit_change();
CREATE TRIGGER reservation_audit AFTER INSERT OR UPDATE ON inventory.reservations FOR EACH ROW EXECUTE FUNCTION monitoring.audit_change();
CREATE TRIGGER order_outbox AFTER INSERT OR UPDATE ON orders.orders FOR EACH ROW EXECUTE FUNCTION monitoring.emit_event();
CREATE TRIGGER payment_outbox AFTER INSERT OR UPDATE ON payments.payments FOR EACH ROW EXECUTE FUNCTION monitoring.emit_event();
CREATE TRIGGER inventory_outbox AFTER INSERT OR UPDATE ON inventory.reservations FOR EACH ROW EXECUTE FUNCTION monitoring.emit_event();
