CREATE OR REPLACE FUNCTION monitoring.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO monitoring.business_audit(table_name,operation,record_id,old_status,new_status,transaction_id)
 VALUES(TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,TG_OP,
 CASE TG_TABLE_NAME WHEN 'orders' THEN to_jsonb(NEW)->>'order_id'
 WHEN 'payments' THEN to_jsonb(NEW)->>'payment_id'
 WHEN 'invoices' THEN to_jsonb(NEW)->>'invoice_id'
 ELSE to_jsonb(NEW)->>'reservation_id' END,
 CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>'status' ELSE NULL END,to_jsonb(NEW)->>'status',txid_current());
 RETURN NEW;
END $$;

CREATE FUNCTION payments.guard_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('ISSUED','VOID') AND
 (NEW.order_id,NEW.payment_id,NEW.invoice_number,NEW.issued_at,NEW.total_cents,NEW.pdf_object_key)
 IS DISTINCT FROM (OLD.order_id,OLD.payment_id,OLD.invoice_number,OLD.issued_at,OLD.total_cents,OLD.pdf_object_key) THEN
  RAISE EXCEPTION 'Issued invoice financial identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='PENDING' AND NEW.status IN ('ISSUED','VOID')) OR (OLD.status='ISSUED' AND NEW.status='VOID')) THEN
  RAISE EXCEPTION 'Invalid invoice status transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION payments.guard_invoice() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payments.guard_invoice() TO market_payments;
CREATE TRIGGER invoice_immutable BEFORE UPDATE ON payments.invoices FOR EACH ROW EXECUTE FUNCTION payments.guard_invoice();
CREATE TRIGGER invoice_audit AFTER INSERT OR UPDATE ON payments.invoices FOR EACH ROW EXECUTE FUNCTION monitoring.audit_change();
