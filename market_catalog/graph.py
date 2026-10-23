"""Fixed parameterized Cypher; explicit fixture candidates, revalidated against approved attributes."""
import csv
import json
from collections import Counter

import httpx

from market_catalog.config import ROOT, settings


def query(statement, **parameters):
    env = settings()
    with httpx.Client(timeout=30, trust_env=False) as client:
        response = client.post(env.get('NEO4J_HTTP_URL', 'http://127.0.0.1:7474') + '/db/neo4j/tx/commit',
            auth=('neo4j', env['NEO4J_PASSWORD']),
            json={'statements': [{'statement': statement, 'parameters': parameters}]})
        response.raise_for_status()
        data = response.json()
        if data['errors']:
            raise RuntimeError('Neo4j: ' + data['errors'][0]['code'])
        result = data['results'][0]
        return [dict(zip(result['columns'], row['row'])) for row in result['data']]


def candidates():
    with (ROOT / 'data/neo4j/compatibility_edges.csv').open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream))


def valid_pair(relation, a, b):
    if not a or not b or not a['active'] or not b['active']:
        return False
    at, bt = a['attributes'], b['attributes']
    rules = {
        'CPU_MOTHERBOARD_COMPATIBLE': ('CPU', 'MOTHERBOARD', lambda: at['socket'] == bt['socket'] and at['memory_type'] == bt['memory_type']),
        'CPU_COOLER_COMPATIBLE': ('CPU', 'COOLER', lambda: at['socket'] in bt['sockets'] and bt['cooling_capacity_w'] >= at['tdp_w']),
        'MOTHERBOARD_RAM_COMPATIBLE': ('MOTHERBOARD', 'RAM', lambda: at['memory_type'] == bt['memory_type'] and bt['capacity_gb'] <= at['max_memory_gb']),
        'MOTHERBOARD_CASE_COMPATIBLE': ('MOTHERBOARD', 'CASE', lambda: at['form_factor'] in bt['motherboard_forms']),
        'MOTHERBOARD_STORAGE_COMPATIBLE': ('MOTHERBOARD', 'SSD', lambda: (bt['interface'] == 'NVMe' and at['m2_slots'] > 0) or (bt['interface'] == 'SATA' and at['sata_ports'] > 0)),
        'GPU_CASE_COMPATIBLE': ('GPU', 'CASE', lambda: at['length_mm'] <= bt['max_gpu_length_mm']),
        'GPU_PSU_CONNECTORS_COMPATIBLE': ('GPU', 'PSU', lambda: all(bt['gpu_connectors'].get(k, 0) >= v for k, v in Counter(at['power_connectors']).items())),
        'COOLER_CASE_COMPATIBLE': ('COOLER', 'CASE', lambda: at['height_mm'] <= bt['max_cooler_height_mm']),
    }
    try:
        ac, bc, predicate = rules[relation]
        return a['category'] == ac and b['category'] == bc and predicate()
    except (KeyError, TypeError, ValueError):
        return False


def sync_product(document, published):
    pid = document['product_id']
    attributes = document['attributes']
    properties = {key: document[key] for key in ['product_id', 'sku', 'name', 'category', 'brand',
        'active', 'source_version', 'source_revision', 'publication_version', 'published_at',
        'validation_status', 'technical_validation_version', 'source_system']}
    properties.update(technical_attributes_json=json.dumps(attributes, sort_keys=True, separators=(',', ':')),
                      provenance='UnoPim approved revision', publication_digest=document['publication_digest'])
    properties.update({key: json.dumps(value, sort_keys=True) if isinstance(value, dict) else value
                       for key, value in attributes.items()})
    edges = []
    for source in candidates():
        a_id, b_id = int(source['from_id']), int(source['to_id'])
        if pid not in (a_id, b_id):
            continue
        a, b = published.get(a_id), published.get(b_id)
        if not a or not b:
            continue
        edges.append({'a': a_id, 'b': b_id, 'rule': source['rule'], 'relation_type': source['type'],
            'props': {'validation_status': 'RULE_VALIDATED' if valid_pair(source['type'], a, b) else 'INVALIDATED',
                'rule_version': source['rule_version'], 'provenance': source['provenance'],
                'source': 'UnoPim approved projections; explicit V3 fixture candidate',
                'source_version': source['source_version'], 'validated_at': document['published_at'],
                'updated_at': document['published_at'], 'from_publication_version': a['publication_version'],
                'to_publication_version': b['publication_version'], 'from_source_version': a['source_version'],
                'to_source_version': b['source_version']}})
    # One graph transaction invalidates every old incident edge before revalidating only allowlisted candidates.
    query('''MERGE (p:Product {product_id:$id})
        WITH p, coalesce(p.provenance,$props.provenance) AS provenance
        SET p = $props SET p.provenance=provenance, p.pim_source='UnoPim approved revision'
        WITH p OPTIONAL MATCH (p)-[r:COMPATIBLE]-(:Product)
        SET r.validation_status='INVALIDATED', r.updated_at=$updated
        WITH DISTINCT p
        CALL (p) {
            UNWIND $edges AS e
            MATCH (a:Product {product_id:e.a}), (b:Product {product_id:e.b})
            MERGE (a)-[r:COMPATIBLE {rule:e.rule,relation_type:e.relation_type}]->(b)
            SET r += e.props
        }
        RETURN p.product_id AS id''', id=pid, props=properties, edges=edges, updated=document['published_at'])


def compatible(product_id, category=None):
    return query('''MATCH (a:Product {product_id:$id})-[r:COMPATIBLE]-(b:Product)
        WHERE a.active=true AND b.active=true AND r.validation_status='RULE_VALIDATED'
          AND ($category IS NULL OR b.category=$category)
          AND a.validation_status='APPROVED' AND b.validation_status='APPROVED'
        RETURN a.publication_version AS source_version, a.publication_digest AS source_digest,
          b.product_id AS id, b.publication_version AS version, b.publication_digest AS digest,
          r.rule AS rule, r.rule_version AS rule_version, r.provenance AS provenance,
          r.from_publication_version AS from_version, r.to_publication_version AS to_version,
          startNode(r).product_id AS from_id, r.validation_status AS validation_status
        ORDER BY id,rule LIMIT 100''', id=product_id, category=category)
