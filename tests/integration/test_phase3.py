"""Live UnoPim -> worker container -> MongoDB/Neo4j -> Traefik GraphQL verification.

Writes only through UnoPim and the worker. Test product 900001 is retained inactive;
the seed CPU's technical attributes are restored by a newer approved revision.
"""
import json
import subprocess

import httpx
import pytest
from pymongo.errors import OperationFailure

from market_catalog import graph
from market_catalog.config import ROOT, mongo
from market_catalog.pim import UnoPim, approved
from market_catalog.sync import StalePublication, Worker

SKU = 'MH-PHASE3-VERIFY-900001'


@pytest.fixture(scope='module')
def pim():
    client = UnoPim()
    yield client
    client.close()


@pytest.fixture(scope='module')
def worker():
    instance = Worker()
    instance.configure()
    yield instance
    instance.client.close()


def gql(query, errors=False):
    response = httpx.post('http://127.0.0.1:8080/graphql', json={'query': query}, timeout=30, trust_env=False)
    response.raise_for_status()
    payload = response.json()
    if not errors:
        assert not payload.get('errors'), payload
    return payload


def container_sync():
    result = subprocess.run(['docker', 'compose', '--profile', 'catalog', 'run', '--rm', '--no-deps',
        'product-sync', 'python', '-m', 'market_catalog.sync', '--once'], cwd=ROOT,
        check=False, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr[-3000:]


def revision(pim, sku, common=None, active=None):
    previous = pim.product(sku)['values']['common']
    version = int(previous['mh_publication_version']) + 1
    changes = {'mh_source_revision': str(int(previous['mh_source_revision']) + 1),
        'mh_source_version': f'verified-{sku}-v{version}', 'mh_publication_version': str(version),
        'mh_approval_status': 'DRAFT', 'mh_approved_hash': '', **(common or {})}
    pim.patch(sku, changes, active)
    return version


def test_seed_products_are_authored_and_approved_in_unopim(pim, worker):
    seeds = json.loads((ROOT / 'data/catalog/mongodb_products.json').read_text())
    all_products = list(pim.products())
    bysku = {p['sku']: p for p in all_products}
    assert len({p['sku'] for p in all_products}) == len(all_products)
    for seed in seeds:
        source = bysku[seed['sku']]
        assert source['family'] == 'mh_' + seed['category'].lower()
        document = approved(source)
        assert document is not None
        projection = worker.db.products.find_one({'product_id': seed['product_id']})
        assert projection['source_version'] == document['source_version']
        assert projection['publication_version'] == document['publication_version']
        assert projection['attributes'] == document['attributes']
        assert projection['sync_state'] == 'READY'
    assert len({p['family'] for p in bysku.values() if p['sku'] in {s['sku'] for s in seeds}}) == 8


def test_graphql_filters_pagination_search_and_lookups():
    result = gql('''{ products(category:CPU,brand:"AMD",minPriceCents:100,maxPriceCents:40000,pageSize:2) {
        total page pageSize hasNext items { productId category brand priceCents currency attributes sourceVersion publicationVersion }
      } product(id:"1001") { productId sku } productBySku(sku:"MH-CPU-1001") { productId }
      categories brands(category:CPU) }''')['data']
    assert result['product']['productId'] == result['productBySku']['productId'] == '1001'
    assert len(result['products']['items']) == 2
    assert result['products']['hasNext']
    assert all(p['category'] == 'CPU' and p['brand'] == 'AMD' for p in result['products']['items'])
    first = gql('{products(pageSize:2,page:1){items{productId}}}')['data']['products']['items']
    second = gql('{products(pageSize:2,page:2){items{productId}}}')['data']['products']['items']
    assert not {p['productId'] for p in first} & {p['productId'] for p in second}
    assert gql('{products(search:"Ryzen"){total}}')['data']['products']['total'] >= 1
    assert gql('{product(productId:"9223372036854775807"){sku}}')['data']['product'] is None


@pytest.mark.parametrize('query', ['{products(pageSize:101){total}}', '{products(page:0){total}}',
    '{products(minPriceCents:100,maxPriceCents:1){total}}', '{product(id:"not-a-number"){sku}}',
    '{products(category:UNKNOWN){total}}', 'mutation {deleteProduct(id:"1001")}'])
def test_graphql_rejects_invalid_inputs_and_writes(query):
    assert gql(query, errors=True).get('errors')


def test_compatibility_candidates_are_validated_and_negative_pairs_absent():
    rows = gql('{compatibleProducts(productId:"1001",category:MOTHERBOARD){product{productId} ruleVersion provenance validationStatus}}')['data']['compatibleProducts']
    ids = {p['product']['productId'] for p in rows}
    assert '1007' in ids and '1010' not in ids
    assert all(r['validationStatus'] == 'RULE_VALIDATED' and r['ruleVersion'] and r['provenance'] for r in rows)


def test_supplied_negative_pairs_are_not_returned_by_graphql():
    fixtures = json.loads((ROOT / 'data/ai/incompatible_examples.json').read_text())
    for fixture in fixtures:
        components = fixture.get('components', {})
        # Full-build power/budget and hypothetical attribute overrides are not binary graph queries.
        if len(components) != 2 or fixture.get('override_attributes'):
            continue
        (_source_category, source_id), (target_category, target_id) = components.items()
        query = '{compatibleProducts(productId:"' + str(source_id) + '",category:' + target_category + '){product{productId}}}'
        rows = gql(query)['data']['compatibleProducts']
        assert str(target_id) not in {row['product']['productId'] for row in rows}, fixture['case_id']


def test_repeated_sync_is_a_noop(pim, worker):
    document = approved(pim.product('MH-CPU-1001'))
    before = worker.db.products.find_one({'product_id': 1001})
    jobs = worker.db.sync_jobs.count_documents({})
    assert worker.publish(document) == worker.publish(document) == 'unchanged'
    assert worker.db.products.find_one({'product_id': 1001}) == before
    assert worker.db.sync_jobs.count_documents({}) == jobs


def test_changed_content_requires_new_versions_and_identity_is_stable(pim, worker):
    document = approved(pim.product('MH-CPU-1001'))
    for changes in [
        {'name': document['name'] + ' unversioned'},
        {'sku': 'ILLEGAL-IDENTITY-CHANGE'},
        {'publication_version': document['publication_version'] + 1},
        {'source_revision': document['source_revision'] + 1,
         'publication_version': document['publication_version'] + 1},
    ]:
        with pytest.raises(StalePublication):
            worker.publish({**document, **changes})


def test_another_worker_cannot_publish_while_a_lease_is_held(worker):
    competing = Worker()
    try:
        with worker.lock(), pytest.raises(RuntimeError, match='Another product synchronization'), competing.lock():
            pytest.fail('Concurrent publisher acquired the global lease')
    finally:
        competing.client.close()


def test_creation_approval_update_partial_failure_and_deactivation(pim, worker, monkeypatch):
    source = pim.product(SKU)
    if source is None:
        document = approved(pim.product('MH-CPU-1001'))
        document = dict(document, product_id=900001, sku=SKU, name='Phase 3 verification CPU',
            source_version='phase3-demo-v1', source_revision=1, publication_version=1)
        pim.create(document)
        assert worker.db.products.find_one({'product_id': 900001}) is None
    else:
        revision(pim, SKU, {'mh_name': 'Phase 3 verification CPU'}, active=True)
    assert approved(pim.product(SKU)) is None
    # A draft never creates/advances its projection.
    before = worker.db.products.find_one({'product_id': 900001})
    container_sync()
    assert worker.db.products.find_one({'product_id': 900001}) == before
    pim.approve(SKU)
    container_sync()
    first = approved(pim.product(SKU))
    assert gql('{product(id:"900001"){name}}')['data']['product']['name'] == 'Phase 3 verification CPU'
    version = revision(pim, SKU, {'mh_name': 'Phase 3 updated CPU', 'mh_spec_tdp_w': '66'})
    # Editing an approved product revokes publication eligibility until its new content is approved.
    assert approved(pim.product(SKU)) is None
    pim.approve(SKU)
    updated = approved(pim.product(SKU))
    original = graph.sync_product

    def fail_graph(*args, **kwargs):
        raise RuntimeError('Injected graph outage')

    with monkeypatch.context() as patch:
        patch.setattr(graph, 'sync_product', fail_graph)
        with pytest.raises(RuntimeError, match='Injected graph outage'):
            worker.publish(updated)
    assert graph.sync_product is original
    assert worker.db.sync_jobs.find_one({'_id': f'900001:{version}'})['state'] == 'ERROR'
    assert worker.db.sync_errors.find_one({'product_id': 900001, 'error_code': 'RuntimeError'})
    assert gql('{product(id:"900001"){sku}}')['data']['product'] is None
    container_sync()
    result = gql('{product(id:"900001"){name publicationVersion attributes}}')['data']['product']
    assert result['name'] == 'Phase 3 updated CPU' and result['publicationVersion'] == version
    assert result['attributes']['tdp_w'] == 66
    node = graph.query('MATCH (p:Product {product_id:900001}) RETURN properties(p) AS p')[0]['p']
    assert node['publication_version'] == version and node['tdp_w'] == 66
    assert worker.db.products.count_documents({'product_id': 900001}) == 1
    assert graph.query('MATCH (p:Product {product_id:900001}) RETURN count(p) AS n')[0]['n'] == 1
    # A second failure window: both projections succeed, final journal acknowledgement fails.
    journal_version = revision(pim, SKU, {'mh_description': 'Verified journal acknowledgement recovery'})
    pim.approve(SKU)
    ready_document = approved(pim.product(SKU))
    original_complete = worker.complete

    def fail_ack(*args, **kwargs):
        raise RuntimeError('Injected acknowledgement outage')

    with monkeypatch.context() as patch:
        patch.setattr(worker, 'complete', fail_ack)
        with pytest.raises(RuntimeError, match='Injected acknowledgement outage'):
            worker.publish(ready_document)
    assert worker.complete == original_complete
    assert worker.db.products.find_one({'product_id': 900001})['sync_state'] == 'READY'
    assert worker.db.sync_jobs.find_one({'_id': f'900001:{journal_version}'})['state'] == 'ERROR'
    assert worker.publish(ready_document) == 'unchanged'
    assert worker.db.sync_jobs.find_one({'_id': f'900001:{journal_version}'})['state'] == 'COMPLETE'
    # New products do not acquire guessed compatibility edges.
    assert gql('{compatibleProducts(productId:"900001"){rule}}')['data']['compatibleProducts'] == []
    with pytest.raises(StalePublication):
        worker.publish(first)
    revision(pim, SKU, active=False)
    pim.approve(SKU)
    container_sync()
    assert gql('{product(id:"900001"){sku}}')['data']['product'] is None
    assert gql('{productBySku(sku:"'+SKU+'",includeInactive:true){active}}')['data']['productBySku']['active'] is False
    assert graph.query('MATCH (p:Product {product_id:900001}) RETURN p.active AS active')[0]['active'] is False


def test_changed_specs_invalidate_old_edges_and_restore_by_new_revision(pim):
    sku = 'MH-CPU-1001'
    before = approved(pim.product(sku))
    original_socket = before['attributes']['socket']
    try:
        revision(pim, sku, {'mh_spec_socket': 'UNKNOWN_TEST_SOCKET'})
        pim.approve(sku)
        container_sync()
        assert gql('{compatibleProducts(productId:"1001",category:MOTHERBOARD){rule}}')['data']['compatibleProducts'] == []
        invalid = graph.query("MATCH (:Product {product_id:1001})-[r:COMPATIBLE]->(:Product {product_id:1007}) RETURN r.validation_status AS status")
        assert invalid[0]['status'] == 'INVALIDATED'
    finally:
        revision(pim, sku, {'mh_spec_socket': original_socket})
        pim.approve(sku)
        container_sync()
    assert gql('{compatibleProducts(productId:"1001",category:MOTHERBOARD){product{productId}}}')['data']['compatibleProducts']


def test_ids_metadata_and_graph_relations_match_published_revisions(pim, worker):
    sources = {d['product_id']: d for p in pim.products() if (d := approved(p)) is not None}
    products = {p['product_id']: p for p in worker.db.products.find({'sync_state': 'READY'})}
    nodes = {r['id']: r['p'] for r in graph.query('MATCH (p:Product) RETURN p.product_id AS id,properties(p) AS p')}
    assert set(sources) == set(products) == set(nodes)
    for pid, source in sources.items():
        assert products[pid]['source_version'] == nodes[pid]['source_version'] == source['source_version']
        assert products[pid]['publication_version'] == nodes[pid]['publication_version'] == source['publication_version']
        assert products[pid]['attributes'] == source['attributes']
        assert products[pid]['active'] == nodes[pid]['active'] == source['active']
    allowed = {(int(e['from_id']), int(e['to_id']), e['type']) for e in graph.candidates()}
    edges = graph.query('MATCH (a)-[r:COMPATIBLE]->(b) RETURN a.product_id AS a,b.product_id AS b,properties(r) AS r')
    for row in edges:
        a, b, rel = row['a'], row['b'], row['r']
        assert a in nodes and b in nodes and (a, b, rel['relation_type']) in allowed
        if rel['validation_status'] == 'RULE_VALIDATED':
            assert graph.valid_pair(rel['relation_type'], products[a], products[b])
            assert rel['from_publication_version'] == products[a]['publication_version']
            assert rel['to_publication_version'] == products[b]['publication_version']


def test_catalogue_mongo_login_cannot_write():
    with mongo('read') as client, pytest.raises(OperationFailure):
        client.market_catalog.products.update_one({'product_id': -1}, {'$set': {'active': True}})
