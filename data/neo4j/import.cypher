// Legacy manual CSV entry point. Phase 2 uses import_v3.cypher through data/seeds/phase2.py.
// Neo4j Community; copy CSVs into Neo4j's import directory.
// Relationship labels are kept as 'relation_type' properties to avoid dynamic Cypher.
CREATE CONSTRAINT product_id_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.product_id IS UNIQUE;
LOAD CSV WITH HEADERS FROM 'file:///product_nodes.csv' AS row
MERGE (p:Product {product_id: toInteger(row.product_id)})
SET p.sku=row.sku, p.name=row.name, p.category=row.category, p.brand=row.brand,
    p.source_version=row.source_version,
    p.publication_version=toInteger(row.publication_version),
    p.validation_status=row.validation_status,
    p.technical_validation_version=row.technical_validation_version,
    p.published_at=datetime(row.published_at),
    p.provenance=row.provenance,
    p.technical_attributes_json=row.technical_attributes_json ,
    p.bios_generation = CASE WHEN row.bios_generation = '' THEN null ELSE toInteger(row.bios_generation) END,
    p.board_power_w = CASE WHEN row.board_power_w = '' THEN null ELSE toInteger(row.board_power_w) END,
    p.capacity_gb = CASE WHEN row.capacity_gb = '' THEN null ELSE toInteger(row.capacity_gb) END,
    p.cooling_capacity_w = CASE WHEN row.cooling_capacity_w = '' THEN null ELSE toInteger(row.cooling_capacity_w) END,
    p.efficiency = CASE WHEN row.efficiency = '' THEN null ELSE row.efficiency END,
    p.form_factor = CASE WHEN row.form_factor = '' THEN null ELSE row.form_factor END,
    p.gpu_connectors = CASE WHEN row.gpu_connectors = '' THEN null ELSE row.gpu_connectors END,
    p.height_mm = CASE WHEN row.height_mm = '' THEN null ELSE toInteger(row.height_mm) END,
    p.integrated_gpu = CASE WHEN row.integrated_gpu = '' THEN null ELSE row.integrated_gpu END,
    p.interface = CASE WHEN row.interface = '' THEN null ELSE row.interface END,
    p.length_mm = CASE WHEN row.length_mm = '' THEN null ELSE toInteger(row.length_mm) END,
    p.m2_slots = CASE WHEN row.m2_slots = '' THEN null ELSE toInteger(row.m2_slots) END,
    p.max_cooler_height_mm = CASE WHEN row.max_cooler_height_mm = '' THEN null ELSE toInteger(row.max_cooler_height_mm) END,
    p.max_gpu_length_mm = CASE WHEN row.max_gpu_length_mm = '' THEN null ELSE toInteger(row.max_gpu_length_mm) END,
    p.max_memory_gb = CASE WHEN row.max_memory_gb = '' THEN null ELSE toInteger(row.max_memory_gb) END,
    p.memory_type = CASE WHEN row.memory_type = '' THEN null ELSE row.memory_type END,
    p.modules = CASE WHEN row.modules = '' THEN null ELSE toInteger(row.modules) END,
    p.motherboard_forms = CASE WHEN row.motherboard_forms = '' THEN null ELSE row.motherboard_forms END,
    p.performance_score = CASE WHEN row.performance_score = '' THEN null ELSE toInteger(row.performance_score) END,
    p.power_connectors = CASE WHEN row.power_connectors = '' THEN null ELSE row.power_connectors END,
    p.sata_ports = CASE WHEN row.sata_ports = '' THEN null ELSE toInteger(row.sata_ports) END,
    p.socket = CASE WHEN row.socket = '' THEN null ELSE row.socket END,
    p.sockets = CASE WHEN row.sockets = '' THEN null ELSE row.sockets END,
    p.tdp_w = CASE WHEN row.tdp_w = '' THEN null ELSE toInteger(row.tdp_w) END,
    p.wattage_w = CASE WHEN row.wattage_w = '' THEN null ELSE toInteger(row.wattage_w) END;

LOAD CSV WITH HEADERS FROM 'file:///compatibility_edges.csv' AS row
MATCH (a:Product {product_id: toInteger(row.from_id)})
MATCH (b:Product {product_id: toInteger(row.to_id)})
MERGE (a)-[r:COMPATIBLE {rule: row.rule, relation_type: row.type}]->(b)
SET r.provenance=row.provenance,
    r.validation_status=row.validation_status,
    r.rule_version=row.rule_version,
    r.validated_at=datetime(row.validated_at),
    r.source_version=row.source_version;
// NOTE: array/map attributes in product_nodes.csv are serialized JSON strings.
// The deterministic solver should use the structured MongoDB attributes or parse JSON.
// BIOS generation in this synthetic data is NOT a verified firmware support matrix.
