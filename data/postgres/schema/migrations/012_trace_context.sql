ALTER TABLE orders.sagas ADD COLUMN traceparent text;
CREATE TABLE monitoring.log_purge_runs (
 run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 deleted_count bigint NOT NULL DEFAULT 0, status text NOT NULL CHECK(status IN ('RUNNING','COMPLETE','ERROR'))
);
CREATE FUNCTION monitoring.purge_technical_logs() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,monitoring AS $$
DECLARE n bigint; run bigint;
BEGIN
 INSERT INTO monitoring.log_purge_runs(status) VALUES('RUNNING') RETURNING run_id INTO run;
 DELETE FROM monitoring.application_logs WHERE created_at<now()-interval '7 days';
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE monitoring.log_purge_runs SET ended_at=now(),deleted_count=n,status='COMPLETE' WHERE run_id=run;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION monitoring.purge_technical_logs() FROM PUBLIC;
