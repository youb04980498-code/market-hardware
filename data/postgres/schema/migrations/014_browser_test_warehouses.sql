-- Browser fixture city is defined explicitly in frontend/tests/market.spec.ts.
UPDATE inventory.warehouses SET classification='TEST' WHERE classification='OPERATIONAL' AND name LIKE 'Phase5 browser verification %' AND city='Isolated E2E';
