-- Market Hardware: one database, four service-owned schemas.
-- Run against market_db only after reviewing the database initialization plan.
-- Restricted service roles and grants remain to be implemented with migrations.
BEGIN;

CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS auth;

COMMIT;
