CREATE FUNCTION monitoring.guard_initial_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT monitoring.snapshot_seed() AND NEW.status<>'PENDING' THEN
  RAISE EXCEPTION 'New orders and payments must start PENDING' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION monitoring.guard_initial_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION monitoring.guard_initial_status() TO market_orders,market_payments;
CREATE TRIGGER initial_order_status BEFORE INSERT ON orders.orders FOR EACH ROW EXECUTE FUNCTION monitoring.guard_initial_status();
CREATE TRIGGER initial_payment_status BEFORE INSERT ON payments.payments FOR EACH ROW EXECUTE FUNCTION monitoring.guard_initial_status();

CREATE OR REPLACE FUNCTION orders.guard_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
 SELECT status INTO current_status FROM orders.orders
  WHERE order_id=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END FOR UPDATE;
 IF NOT monitoring.snapshot_seed() AND current_status IS NOT NULL AND current_status<>'PENDING' THEN
  RAISE EXCEPTION 'Confirmed order lines are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.order_id<>OLD.order_id OR NEW.product_id<>OLD.product_id OR NEW.unit_price_cents<>OLD.unit_price_cents) THEN
  RAISE EXCEPTION 'Order line identity and purchase price are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER item_snapshot_insert BEFORE INSERT OR DELETE ON orders.order_items FOR EACH ROW EXECUTE FUNCTION orders.guard_item_snapshot();

CREATE FUNCTION inventory.create_reservation(p_order bigint,p_product bigint,p_warehouse bigint,p_quantity integer)
RETURNS inventory.reservations LANGUAGE plpgsql AS $$
DECLARE result inventory.reservations;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory.reserve:'||p_order||':'||p_product||':'||p_warehouse,0));
 SELECT * INTO result FROM inventory.reservations
 WHERE order_id=p_order AND product_id=p_product AND warehouse_id=p_warehouse;
 IF FOUND THEN
  IF result.quantity<>p_quantity THEN RAISE EXCEPTION 'Reservation idempotency conflict' USING ERRCODE='23514'; END IF;
  RETURN result;
 END IF;
 INSERT INTO inventory.reservations(order_id,product_id,warehouse_id,quantity,status)
 VALUES(p_order,p_product,p_warehouse,p_quantity,'ACTIVE') RETURNING * INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION inventory.create_reservation(bigint,bigint,bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inventory.create_reservation(bigint,bigint,bigint,integer) TO market_inventory;

CREATE FUNCTION payments.check_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='SENT' AND NOT EXISTS(SELECT FROM payments.invoices WHERE invoice_id=NEW.invoice_id AND status='ISSUED') THEN
  RAISE EXCEPTION 'Notification requires an issued invoice' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION payments.check_notification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payments.check_notification() TO market_payments;
CREATE TRIGGER notification_invoice BEFORE INSERT OR UPDATE ON payments.notification_deliveries FOR EACH ROW EXECUTE FUNCTION payments.check_notification();
