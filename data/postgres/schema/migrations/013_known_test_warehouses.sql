-- Exact generator provenance is established in tests/integration/test_phase4.py,
-- test_phase6.py and frontend/tests/market.spec.ts. Never classify arbitrary names.
UPDATE inventory.warehouses SET classification='TEST'
WHERE classification='OPERATIONAL' AND (
 (name LIKE 'Phase4 verification %' AND city='Local tests') OR
 (name LIKE 'Final unit %' AND city='Tests') OR
 (name LIKE 'Phase5 browser verification %' AND city='Browser tests') OR
 (name LIKE 'Phase6 refund %' AND city='Analytics tests') OR
 (name LIKE 'Phase6 outage %' AND city='Analytics tests'));
