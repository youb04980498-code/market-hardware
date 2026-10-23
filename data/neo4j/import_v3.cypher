// Parameters come only from validated V3 source CSVs. No inferred relationships.
UNWIND $nodes AS row
MERGE (p:Product {product_id: row.product_id})
ON CREATE SET p += row.properties;

UNWIND $edges AS row
MATCH (a:Product {product_id: row.from_id})
MATCH (b:Product {product_id: row.to_id})
MERGE (a)-[r:COMPATIBLE {rule: row.rule, relation_type: row.relation_type}]->(b)
ON CREATE SET r += row.properties;
