DO $permissions$
DECLARE s text;
BEGIN
 FOREACH s IN ARRAY ARRAY['auth','orders','inventory','payments'] LOOP
  EXECUTE format('REVOKE UPDATE ON %I.outbox_events FROM %I',s,'market_'||s);
 END LOOP;
END $permissions$;
CREATE FUNCTION orders.validate_line_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id bigint; expected_currency text;
BEGIN
 SELECT auth_user_id,currency INTO owner_id,expected_currency FROM orders.orders WHERE order_id=NEW.order_id;
 IF owner_id IS NOT NULL AND (NEW.sku IS NULL OR btrim(NEW.sku)='' OR NEW.product_name IS NULL
   OR NEW.currency<>expected_currency OR NEW.publication_version IS NULL OR NEW.publication_version<1
   OR NEW.warehouse_id IS NULL OR NEW.warehouse_id<1) THEN
  RAISE EXCEPTION 'New checkout lines require a complete publication snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION orders.validate_line_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orders.validate_line_snapshot() TO market_orders;
CREATE TRIGGER line_publication BEFORE INSERT OR UPDATE ON orders.order_items FOR EACH ROW EXECUTE FUNCTION orders.validate_line_snapshot();
