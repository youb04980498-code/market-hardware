REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA auth,orders,inventory,payments,monitoring FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA auth,orders,inventory,payments,monitoring FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth,orders,inventory,payments,monitoring FROM PUBLIC;
DO $roles$
DECLARE s text; role_name text;
BEGIN
 FOREACH s IN ARRAY ARRAY['auth','orders','inventory','payments'] LOOP
  role_name:='market_'||s;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('CREATE ROLE %I NOLOGIN',role_name); END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',s,role_name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA %I TO %I',s,role_name);
  EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I',s,role_name);
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO %I',s,role_name);
  EXECUTE format('GRANT USAGE ON SCHEMA monitoring TO %I',role_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION monitoring.snapshot_seed(),monitoring.emit_event(),monitoring.guard_status(),monitoring.audit_change() TO %I',role_name);
  EXECUTE format('GRANT INSERT ON monitoring.application_logs TO %I',role_name);
  EXECUTE format('GRANT USAGE ON SEQUENCE monitoring.application_logs_log_id_seq TO %I',role_name);
 END LOOP;
END $roles$;
