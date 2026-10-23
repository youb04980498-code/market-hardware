"""Approval and explicit pair rules, independent of database availability."""
import copy
import json

import pytest

from market_catalog.graph import candidates, valid_pair
from market_catalog.pim import ROOT, PimError, approved, digest, to_document, validate

FIXTURES = json.loads((ROOT / 'data/catalog/mongodb_products.json').read_text())
PRODUCTS = {p['product_id']: p for p in FIXTURES}
NEGATIVE = json.loads((ROOT / 'data/ai/incompatible_examples.json').read_text())
PAIR_RULES = {
    ('CPU', 'MOTHERBOARD'): 'CPU_MOTHERBOARD_COMPATIBLE',
    ('MOTHERBOARD', 'RAM'): 'MOTHERBOARD_RAM_COMPATIBLE',
    ('MOTHERBOARD', 'CASE'): 'MOTHERBOARD_CASE_COMPATIBLE',
    ('GPU', 'CASE'): 'GPU_CASE_COMPATIBLE',
    ('CPU', 'COOLER'): 'CPU_COOLER_COMPATIBLE',
    ('GPU', 'PSU'): 'GPU_PSU_CONNECTORS_COMPATIBLE',
}


def source_record():
    product = dict(copy.deepcopy(FIXTURES[0]), source_revision=1, description='')
    common = {'mh_' + k: str(v) for k, v in product.items() if k != 'attributes'}
    common.update({'mh_spec_' + k: json.dumps(v) if isinstance(v, (list, dict))
                   else str(v).lower() if isinstance(v, bool) else str(v)
                   for k, v in product['attributes'].items()})
    record = {'sku': product['sku'], 'status': True, 'values': {'common': common}}
    common.update(mh_approval_status='APPROVED', mh_approved_hash=digest(to_document(record)))
    return record


def test_approval_is_bound_to_revision_and_content():
    source = source_record()
    assert approved(source)['product_id'] == 1001
    source['values']['common']['mh_name'] = 'Changed without reapproval'
    with pytest.raises(PimError, match='Approval does not match'):
        approved(source)
    source['values']['common']['mh_approval_status'] = 'DRAFT'
    assert approved(source) is None


@pytest.mark.parametrize('field,value', [('price_cents', -1), ('product_id', 0), ('currency', 'eur'),
    ('publication_version', 0), ('source_revision', 0), ('published_at', 'invalid'), ('published_at', '2026-01-01')])
def test_invalid_publications(field, value):
    document = to_document(source_record())
    document[field] = value
    with pytest.raises(PimError):
        validate(document)


@pytest.mark.parametrize('edge', candidates(), ids=lambda e: e['from_id'] + '-' + e['to_id'])
def test_all_supplied_compatibility_candidates_have_valid_predicates(edge):
    assert valid_pair(edge['type'], PRODUCTS[int(edge['from_id'])], PRODUCTS[int(edge['to_id'])])


@pytest.mark.parametrize('relation,a,b', [
    ('CPU_MOTHERBOARD_COMPATIBLE', 1001, 1010),
    ('MOTHERBOARD_RAM_COMPATIBLE', 1007, 1017),
    ('GPU_CASE_COMPATIBLE', 1020, 1034),
])
def test_negative_pairs(relation, a, b):
    # Deliberately mismatched categories or specifications must never become proven edges.
    assert not valid_pair(relation, PRODUCTS[a], PRODUCTS[b])


def test_unknown_or_inactive_compatibility_is_not_valid():
    a, b = copy.deepcopy(PRODUCTS[1001]), copy.deepcopy(PRODUCTS[1007])
    assert not valid_pair('unrecognized_rule', a, b)
    a['active'] = False
    assert not valid_pair('CPU_MOTHERBOARD_COMPATIBLE', a, b)
    a['active'] = True
    a['attributes'].pop('socket')
    assert not valid_pair('CPU_MOTHERBOARD_COMPATIBLE', a, b)


@pytest.mark.parametrize('fixture', [f for f in NEGATIVE if len(f.get('components', {})) == 2], ids=lambda f: f['case_id'])
def test_supplied_negative_pair_fixtures(fixture):
    categories = tuple(fixture['components'])
    a, b = [copy.deepcopy(PRODUCTS[fixture['components'][category]]) for category in categories]
    for product in [a, b]:
        product['attributes'].update(fixture.get('override_attributes', {}).get(product['category'], {}))
    assert not valid_pair(PAIR_RULES[categories], a, b)
