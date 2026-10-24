CREATE TABLE operational_alerts (
 alert_id uuid PRIMARY KEY, identity text NOT NULL UNIQUE,
 type text NOT NULL CHECK(type IN ('LOW_STOCK','PAYMENT_FAILURE','ORDER_SPIKE','WAREHOUSE_SATURATION')),
 severity text NOT NULL CHECK(severity IN ('warning','critical')), source text NOT NULL,
 entity_reference text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 first_detected_at timestamptz NOT NULL DEFAULT now(), last_observed_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ACKNOWLEDGED','RESOLVED')),
 resolved_at timestamptz, acknowledged_at timestamptz,
 CHECK((status='RESOLVED')=(resolved_at IS NOT NULL))
);
CREATE INDEX operational_alerts_status_time ON operational_alerts(status,last_observed_at DESC);
CREATE TABLE alert_actions (
 action_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 alert_id uuid NOT NULL REFERENCES operational_alerts(alert_id), actor_id bigint NOT NULL,
 action text NOT NULL CHECK(action IN ('ACKNOWLEDGED','RESOLVED')), occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON operational_alerts TO market_analytics_api;
GRANT UPDATE(status,resolved_at,acknowledged_at) ON operational_alerts TO market_analytics_api;
GRANT INSERT ON alert_actions TO market_analytics_api;
GRANT USAGE ON SEQUENCE alert_actions_action_id_seq TO market_analytics_api;
