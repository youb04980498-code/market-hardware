from pathlib import Path
import csv,json,collections,uuid
ROOT=Path(__file__).resolve().parents[1]
def rows(rel):
    with (ROOT/rel).open(encoding='utf-8',newline='') as f:return list(csv.DictReader(f))
def load(rel):return json.loads((ROOT/rel).read_text(encoding='utf-8'))
P=load('catalog/mongodb_products.json')
byid={p['product_id']:p for p in P}
assert len(P)==len(byid)==42
assert all(p['currency']=='EUR' and p['source_version'] and p['published_at'] and p['publication_version']>=1 for p in P)
assert {int(r['product_id']) for r in rows('pim/products_import.csv')}==set(byid)
N=rows('neo4j/product_nodes.csv');E=rows('neo4j/compatibility_edges.csv')
assert {int(n['product_id']) for n in N}==set(byid)
for n in N:
    p=byid[int(n['product_id'])]
    assert json.loads(n['technical_attributes_json'])==p['attributes']
    assert n['source_version']==p['source_version'] and n['validation_status']=='APPROVED'
for e in E:
    assert int(e['from_id']) in byid and int(e['to_id']) in byid
    assert e['rule_version'] and e['validation_status']=='RULE_VALIDATED' and e['validated_at']
C=rows('postgres/customers.csv');O=rows('postgres/orders.csv')
I=rows('postgres/order_items.csv');PAY=rows('postgres/payments.csv')
INV=rows('postgres/invoices.csv');S=rows('postgres/stock.csv');R=rows('postgres/reservations.csv')
U=rows('postgres/auth_users.csv');RO=rows('postgres/auth_roles.csv');UR=rows('postgres/auth_user_roles.csv')
customer_ids={int(c['customer_id']) for c in C}
order_ids={int(o['order_id']) for o in O}
assert len(customer_ids)==len(C)
assert all(int(o['customer_id']) in customer_ids for o in O)
assert all(int(i['product_id']) in byid and int(i['order_id']) in order_ids for i in I)
totals=collections.Counter()
for i in I:totals[int(i['order_id'])]+=int(i['quantity'])*int(i['unit_price_cents'])
assert all(totals[int(o['order_id'])]==int(o['total_cents']) for o in O)
pay_ids={int(p['payment_id']):p for p in PAY}
assert all(int(p['order_id']) in order_ids for p in PAY)
assert len({i['order_id'] for i in INV})==len(INV)
assert all(int(i['payment_id']) in pay_ids and pay_ids[int(i['payment_id'])]['status'] in ('SUCCEEDED','REFUNDED') for i in INV)
uid={int(u['user_id']) for u in U};rid={int(r['role_id']) for r in RO}
assert all(int(r['user_id']) in uid and int(r['role_id']) in rid for r in UR)
stock={(int(s['product_id']),int(s['warehouse_id'])):s for s in S}
reserved=collections.Counter()
for r in R:
    assert r['status']=='ACTIVE' and int(r['order_id']) in order_ids
    assert (int(r['product_id']),int(r['warehouse_id'])) in stock
    reserved[(int(r['product_id']),int(r['warehouse_id']))]+=int(r['quantity'])
assert all(int(s['quantity'])>=int(s['reserved_quantity'])>=0 for s in S)
assert all(int(s['reserved_quantity'])==reserved[(int(s['product_id']),int(s['warehouse_id']))] for s in S)
events=[json.loads(line) for line in (ROOT/'kafka/events.jsonl').read_text().splitlines() if line]
assert all(e['version']>=1 and uuid.UUID(e['correlation_id']) and uuid.UUID(e['event_id']) and e['payload'] for e in events)
types={e['event_type'] for e in events}
assert {'order.created','payment.succeeded','payment.failed','inventory.reserved','inventory.reservation_released','product.published','product.updated','payment.refunded'}<=types
assert len({e['event_id'] for e in events})==len(events)
# Pairwise compatibility predicates, also reused by positive and negative test fixtures.
def err(comp,budget=None,overrides=None):
    a={k:dict(byid[v]['attributes']) for k,v in comp.items()}
    for k,values in (overrides or {}).items():a[k].update(values)
    if 'CPU' in a and 'MOTHERBOARD' in a and a['CPU']['socket']!=a['MOTHERBOARD']['socket']:return 'CPU_SOCKET_MISMATCH'
    if 'MOTHERBOARD' in a and 'RAM' in a and a['MOTHERBOARD']['memory_type']!=a['RAM']['memory_type']:return 'RAM_GENERATION_MISMATCH'
    if 'MOTHERBOARD' in a and 'CASE' in a and a['MOTHERBOARD']['form_factor'] not in a['CASE']['motherboard_forms']:return 'CASE_FORM_FACTOR_MISMATCH'
    if 'GPU' in a and 'CASE' in a and a['GPU']['length_mm']>a['CASE']['max_gpu_length_mm']:return 'GPU_CASE_CLEARANCE'
    if 'CPU' in a and 'COOLER' in a and a['CPU']['socket'] not in a['COOLER']['sockets']:return 'COOLER_SOCKET_MISMATCH'
    if 'CPU' in a and 'COOLER' in a and a['COOLER']['cooling_capacity_w']<a['CPU']['tdp_w']:return 'COOLER_CAPACITY_INSUFFICIENT'
    if {'CPU','GPU','PSU'}<=a.keys() and a['PSU']['wattage_w']<int((a['CPU']['tdp_w']+a['GPU']['board_power_w']+75)*1.25):return 'PSU_WATTAGE_INSUFFICIENT'
    if 'GPU' in a and 'PSU' in a:
        req=collections.Counter(a['GPU']['power_connectors'])
        if any(a['PSU']['gpu_connectors'].get(k,0)<v for k,v in req.items()):return 'GPU_POWER_CONNECTORS_MISSING'
    if 'COOLER' in a and 'CASE' in a and a['COOLER']['height_mm']>a['CASE']['max_cooler_height_mm']:return 'COOLER_CASE_CLEARANCE'
    if 'MOTHERBOARD' in a and 'SSD' in a:
        if (a['SSD']['interface']=='NVMe' and a['MOTHERBOARD']['m2_slots']<1) or (a['SSD']['interface']=='SATA' and a['MOTHERBOARD']['sata_ports']<1):return 'STORAGE_INTERFACE_MISMATCH'
    if budget is not None and sum(p['price_cents'] for p in byid.values() if p['category'] in ('CPU','MOTHERBOARD','RAM','GPU','SSD','PSU','CASE','COOLER') and p['price_cents']<=budget)==0:return 'NO_FEASIBLE_BUILD'
    return None
# Compare graph edges to actual predicate conditions; rule status is derived from synthetic specs.
edge_pairs={(int(e['from_id']),int(e['to_id']),e['type']) for e in E}
for e in E:
    a=byid[int(e['from_id'])];b=byid[int(e['to_id'])]
    rel=e['type'];at=a['attributes'];bt=b['attributes']
    conditions={
        'CPU_MOTHERBOARD_COMPATIBLE':lambda:at['socket']==bt['socket'] and at['memory_type']==bt['memory_type'],
        'CPU_COOLER_COMPATIBLE':lambda:at['socket'] in bt['sockets'] and bt['cooling_capacity_w']>=at['tdp_w'],
        'MOTHERBOARD_RAM_COMPATIBLE':lambda:at['memory_type']==bt['memory_type'] and bt['capacity_gb']<=at['max_memory_gb'],
        'MOTHERBOARD_CASE_COMPATIBLE':lambda:at['form_factor'] in bt['motherboard_forms'],
        'MOTHERBOARD_STORAGE_COMPATIBLE':lambda:(bt['interface']=='NVMe' and at['m2_slots']>0) or (bt['interface']=='SATA' and at['sata_ports']>0),
        'GPU_CASE_COMPATIBLE':lambda:at['length_mm']<=bt['max_gpu_length_mm'],
        'GPU_PSU_CONNECTORS_COMPATIBLE':lambda:all(bt['gpu_connectors'].get(k,0)>=v for k,v in collections.Counter(at['power_connectors']).items()),
        'COOLER_CASE_COMPATIBLE':lambda:at['height_mm']<=bt['max_cooler_height_mm']
    }
    assert rel in conditions and conditions[rel](),e
builds=load('ai/validated_pc_builds.json')
for b in builds:
    comp=b['components']
    assert set(comp)=={'CPU','MOTHERBOARD','RAM','GPU','SSD','PSU','CASE','COOLER'}
    assert all(byid[pid]['category']==cat for cat,pid in comp.items())
    assert err(comp) is None,(b['build_id'],err(comp))
    assert sum(byid[pid]['price_cents'] for pid in comp.values())==b['total_cents']<=b['budget_cents']
    # All required graph edges exist.
    pairs=[('CPU','MOTHERBOARD','CPU_MOTHERBOARD_COMPATIBLE'),('CPU','COOLER','CPU_COOLER_COMPATIBLE'),('MOTHERBOARD','RAM','MOTHERBOARD_RAM_COMPATIBLE'),('MOTHERBOARD','CASE','MOTHERBOARD_CASE_COMPATIBLE'),('MOTHERBOARD','SSD','MOTHERBOARD_STORAGE_COMPATIBLE'),('GPU','CASE','GPU_CASE_COMPATIBLE'),('GPU','PSU','GPU_PSU_CONNECTORS_COMPATIBLE'),('COOLER','CASE','COOLER_CASE_COMPATIBLE')]
    assert all((comp[a],comp[b],t) in edge_pairs for a,b,t in pairs)
for fixture in load('ai/incompatible_examples.json'):
    if fixture['case_id']=='BAD-BUDGET':
        cheapest=sum(min(p['price_cents'] for p in P if p['category']==cat) for cat in ('CPU','MOTHERBOARD','RAM','GPU','SSD','PSU','CASE','COOLER'))
        assert fixture['budget_cents']<cheapest
    else:
        assert err(fixture['components'],overrides=fixture.get('override_attributes'))==fixture['expected_error'],(fixture['case_id'],err(fixture['components'],overrides=fixture.get('override_attributes')))
scenarios = load('scenarios/saga_scenarios.json')
assert all(e['scenario_id'] for e in scenarios)
assert 'invoice.ready' in types and 'invoice.created' not in types
assert all('invoice.created' not in s['expected_events'] for s in scenarios)
from validate_v3_scenarios import validate_scenarios
v3_cases = load('ai/v3_edge_cases.json')
validate_scenarios(v3_cases, builds, byid, stock, err)
print(f"PASS: {len(P)} products, {len(E)} verified synthetic graph edges, {len(events)} events, {len(R)} reservations, {len(builds)} positive, 9 negative PC fixtures and {len(v3_cases)} V3 edge cases")
