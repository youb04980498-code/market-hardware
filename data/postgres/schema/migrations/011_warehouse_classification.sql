-- Capacity already exists: retain its values, unit = physical item units.
ALTER TABLE inventory.warehouses ADD COLUMN classification text NOT NULL DEFAULT 'OPERATIONAL'
 CHECK(classification IN ('OPERATIONAL','TEST','ARCHIVED'));
-- Classification is explicit; existing records are not inferred from ambiguous names.
CREATE INDEX warehouses_classification_idx ON inventory.warehouses(classification);
