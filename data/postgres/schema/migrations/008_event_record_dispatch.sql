-- Dispatch fields through JSON so PostgreSQL does not bind columns from another trigger row type.
CREATE OR REPLACE FUNCTION monitoring.emit_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_kind text; aggregate text; aggregate_kind text; correlation uuid; cause uuid; idem text; body jsonb;
BEGIN
 IF monitoring.snapshot_seed() THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
 aggregate_kind:=CASE TG_TABLE_NAME WHEN 'orders' THEN 'order' WHEN 'payments' THEN 'payment' ELSE 'reservation' END;
 aggregate:=CASE TG_TABLE_NAME WHEN 'orders' THEN to_jsonb(NEW)->>'order_id' WHEN 'payments' THEN to_jsonb(NEW)->>'payment_id' ELSE to_jsonb(NEW)->>'reservation_id' END;
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
