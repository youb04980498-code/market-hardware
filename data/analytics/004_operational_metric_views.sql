CREATE VIEW operational_batch_metrics AS
 SELECT kind,status,count(*) AS count FROM jobs GROUP BY kind,status;
GRANT SELECT ON operational_batch_metrics TO market_analytics_api;
