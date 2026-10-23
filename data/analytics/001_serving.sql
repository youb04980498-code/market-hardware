CREATE TABLE IF NOT EXISTS releases (
 release_id text PRIMARY KEY, snapshot_at timestamptz NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(), lake_path text NOT NULL,
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object')
);
CREATE TABLE IF NOT EXISTS current_release (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 release_id text NOT NULL REFERENCES releases(release_id)
);
CREATE TABLE IF NOT EXISTS pipeline_status (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 state text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz, error_code text, metrics jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS jobs (
 job_id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('backfill','quarterly')),
 year integer, quarter integer CHECK(quarter BETWEEN 1 AND 4),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','COMPLETE','ERROR')),
 submitted_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
 completed_at timestamptz, error_code text, result jsonb
);
CREATE TABLE IF NOT EXISTS quarterly_reports (
 period text NOT NULL, release_id text NOT NULL REFERENCES releases(release_id),
 created_at timestamptz NOT NULL DEFAULT now(), document jsonb NOT NULL,
 PRIMARY KEY(period,release_id)
);
GRANT CONNECT ON DATABASE market_analytics TO market_analytics_api;
GRANT USAGE ON SCHEMA public TO market_analytics_api;
GRANT SELECT ON releases,current_release,pipeline_status,quarterly_reports TO market_analytics_api;
