"""UnoPim REST adapter. Approval binds validated content to a source revision."""
import csv
import hashlib
import json
import time
from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import quote

import httpx
from jsonschema import Draft202012Validator

from market_catalog.config import ROOT, settings

COMMON = ['product_id', 'name', 'description', 'brand', 'category', 'price_cents', 'currency',
          'source_version', 'source_revision', 'publication_version', 'published_at',
          'technical_validation_version', 'approval_status', 'approved_hash']
JSON_ATTRIBUTES = {'sockets', 'motherboard_forms', 'power_connectors', 'gpu_connectors'}


class PimError(RuntimeError):
    pass


def now():
    return datetime.now(UTC).isoformat().replace('+00:00', 'Z')


def schema():
    original = json.loads((ROOT / 'data/mongodb/schema/products.validator.json').read_text())['$jsonSchema']

    def convert(value):
        if isinstance(value, list):
            return [convert(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {k: convert(v) for k, v in value.items() if k != 'bsonType'}
        if 'bsonType' in value:
            mapping = {'object': 'object', 'long': 'integer', 'string': 'string',
                       'date': 'string', 'bool': 'boolean', 'array': 'array'}
            types = value['bsonType']
            result['type'] = [mapping[t] for t in types] if isinstance(types, list) else mapping[types]
        return result

    return convert(original)


VALIDATOR = Draft202012Validator(schema())


def validate(document):
    errors = sorted(VALIDATOR.iter_errors(document), key=lambda e: str(e.path))
    if errors:
        raise PimError('Invalid product: ' + errors[0].message)
    if not isinstance(document.get('source_revision'), int) or isinstance(document['source_revision'], bool) or document['source_revision'] < 1:
        raise PimError('A positive source revision is required')
    if not document['source_version']:
        raise PimError('Source version cannot be empty')
    if document['publication_version'] < document['source_revision']:
        raise PimError('Publication version must not precede source revision')
    try:
        timestamp = datetime.fromisoformat(document['published_at'])
        if timestamp.tzinfo is None:
            raise ValueError('Timezone is required')
    except ValueError as exc:
        raise PimError('Invalid publication timestamp') from exc
    return document


def digest(document):
    return hashlib.sha256(json.dumps(document, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def to_document(product):
    common = product.get('values', {}).get('common', {})
    if 'mh_product_id' not in common:
        return None
    attributes = {}
    properties = schema()['properties']['attributes']['properties']
    for key, value in common.items():
        if not key.startswith('mh_spec_') or value is None or value == '':
            continue
        name = key.removeprefix('mh_spec_')
        if name in JSON_ATTRIBUTES:
            value = json.loads(value)
        elif properties.get(name, {}).get('type') == 'integer' or name in {'vram_gb', 'speed_mhz'}:
            value = int(value)
        elif properties.get(name, {}).get('type') == 'boolean':
            value = value in (True, 1, '1', 'true')
        attributes[name] = value
    document = {key: common.get('mh_' + key) for key in COMMON
                if key not in {'approval_status', 'approved_hash'}}
    for key in ['product_id', 'price_cents', 'source_revision', 'publication_version']:
        document[key] = int(document[key])
    document.update(sku=product['sku'], active=bool(product['status']), attributes=attributes,
                    source_system='UnoPim', validation_status='APPROVED')
    document['description'] = document.get('description') or ''
    return document


def approved(product):
    document = to_document(product)
    if document is None:
        return None
    common = product['values']['common']
    if common.get('mh_approval_status') != 'APPROVED':
        return None
    validate(document)
    if common.get('mh_approved_hash') != digest(document):
        raise PimError('Approval does not match the current product content')
    return document


class UnoPim:
    def __init__(self):
        self.env = settings()
        self.client = httpx.Client(base_url=self.env.get('UNOPIM_URL', 'http://127.0.0.1:8000'),
                                   timeout=60, trust_env=False,
                                   headers={'Accept': 'application/json', 'Host': 'localhost:8000'})
        self.token = None
        self.last_request = 0.0

    def close(self):
        self.client.close()

    def authenticate(self):
        response = self.client.post('/oauth/token', json={
            'grant_type': 'password', 'client_id': self.env['UNOPIM_CLIENT_ID'],
            'client_secret': self.env['UNOPIM_CLIENT_SECRET'],
            'username': self.env['UNOPIM_USERNAME'], 'password': self.env['UNOPIM_PASSWORD']})
        if response.status_code != 200:
            raise PimError('UnoPim authentication failed (HTTP ' + str(response.status_code) + ')')
        self.token = response.json()['access_token']

    def request(self, method, path, **kwargs):
        if not self.token:
            self.authenticate()
        for attempt in range(4):
            time.sleep(max(0, 0.55 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = self.client.request(method, '/api/v1/rest/' + path,
                    headers={'Authorization': 'Bearer ' + self.token}, **kwargs)
            except httpx.TransportError:
                if attempt == 3:
                    raise PimError('UnoPim transport failure') from None
                time.sleep(2 ** attempt)
                continue
            if response.status_code == 401 and attempt < 3:
                self.authenticate()
                continue
            if response.status_code in {429, 502, 503, 504} and attempt < 3:
                time.sleep(min(30, max(2 ** attempt, int(response.headers.get('Retry-After', '1')))))
                continue
            if response.status_code == 404:
                return None
            if response.status_code >= 400:
                # Response validation details are useful during configuration, never auth payloads.
                raise PimError(f'UnoPim {method} {path}: HTTP {response.status_code}: {response.text[:1000]}')
            return response.json()
        raise PimError('UnoPim retry limit exceeded')

    def product(self, sku):
        return self.request('GET', 'products/' + quote(sku, safe=''))

    def products(self):
        page = 1
        while True:
            payload = self.request('GET', 'products', params={'page': page, 'limit': 100})
            rows = payload.get('data', [])
            yield from rows
            if len(rows) < 100:
                return
            page += 1

    def patch(self, sku, common=None, active=None):
        body = {'values': {'common': common or {}}}
        if active is not None:
            body['status'] = active
        self.request('PATCH', 'products/' + quote(sku, safe=''), json=body)

    def approve(self, sku, preserve_timestamp=False):
        product = self.product(sku)
        if not product:
            raise PimError('Unknown SKU')
        if not preserve_timestamp:
            self.patch(sku, {'mh_published_at': now(), 'mh_approval_status': 'DRAFT', 'mh_approved_hash': ''})
            product = self.product(sku)
        document = validate(to_document(product))
        self.patch(sku, {'mh_approval_status': 'APPROVED', 'mh_approved_hash': digest(document)})
        return document

    def configure(self):
        fixtures = json.loads((ROOT / 'data/catalog/mongodb_products.json').read_text())
        bycategory = {}
        for p in fixtures:
            bycategory.setdefault(p['category'], set()).update(p['attributes'])
        specs = sorted(set().union(*bycategory.values()))
        for resource, code, payload in [
            ('attribute-groups', 'mh_general', {'code': 'mh_general', 'labels': {'en_US': 'Market Hardware'}}),
            ('attribute-groups', 'mh_technical', {'code': 'mh_technical', 'labels': {'en_US': 'Technical specifications'}}),
        ]:
            self.ensure(resource, code, payload)
        for key in COMMON + ['spec_' + s for s in specs]:
            kind = 'textarea' if key in {'description'} or key.removeprefix('spec_') in JSON_ATTRIBUTES else 'text'
            if key == 'spec_integrated_gpu':
                kind = 'boolean'
            self.ensure('attributes', 'mh_' + key, {'code': 'mh_' + key, 'type': kind,
                'labels': {'en_US': key.replace('_', ' ').title()}, 'value_per_locale': False,
                'value_per_channel': False, 'is_required': False, 'is_unique': key == 'product_id'})
        self.ensure('categories', 'mh_catalog', {'code': 'mh_catalog', 'parent': None,
            'additional_data': {'locale_specific': {'en_US': {'name': 'Market Hardware'}}}})
        for category, fields in bycategory.items():
            self.ensure('categories', 'mh_' + category.lower(), {'code': 'mh_' + category.lower(),
                'parent': 'mh_catalog', 'additional_data': {'locale_specific': {'en_US': {'name': category.title()}}}})
            self.request('PUT', 'categories/mh_' + category.lower(), json={'parent': 'mh_catalog'})
            self.ensure('families', 'mh_' + category.lower(), {'code': 'mh_' + category.lower(),
                'labels': {'en_US': category.title()}, 'attribute_groups': [
                    {'code': 'mh_general', 'position': 1,
                     'custom_attributes': [{'code': key, 'position': i + 1}
                         for i, key in enumerate(['sku'] + ['mh_' + k for k in COMMON])]},
                    {'code': 'mh_technical', 'position': 2,
                     'custom_attributes': [{'code': 'mh_spec_' + key, 'position': i + 1}
                         for i, key in enumerate(sorted(fields))]}]})

    def ensure(self, resource, code, payload):
        existing = self.request('GET', resource + '/' + code)
        if existing is None:
            self.request('POST', resource, json=payload)

    def create(self, document):
        common = {'sku': document['sku']}
        for key in COMMON:
            if key in {'approval_status', 'approved_hash'}:
                continue
            value = document.get(key, '')
            common['mh_' + key] = str(value)
        common.update(mh_approval_status='DRAFT', mh_approved_hash='')
        for key, value in document['attributes'].items():
            common['mh_spec_' + key] = (json.dumps(value, sort_keys=True) if isinstance(value, (dict, list))
                                        else str(value).lower() if isinstance(value, bool) else str(value))
        return self.request('POST', 'products', json={'family': 'mh_' + document['category'].lower(),
            'status': document['active'], 'parent': None, 'additional': None,
            'values': {'common': common, 'categories': ['mh_' + document['category'].lower()]}})

    def import_seed(self):
        catalogue = {p['product_id']: p for p in json.loads((ROOT / 'data/catalog/mongodb_products.json').read_text())}
        with (ROOT / 'data/pim/products_import.csv').open(encoding='utf-8-sig', newline='') as stream:
            for row in csv.DictReader(stream):
                document = dict(catalogue[int(row['product_id'])], source_revision=1, description='')
                # Explicit mapping: CSV decimals are not SQL/MongoDB cents; verify without float rounding.
                if int(Decimal(row['price_eur']) * 100) != document['price_cents']:
                    raise PimError('PIM seed price does not match catalogue')
                if json.loads(row['attributes_json']) != document['attributes'] or row['sku'] != document['sku']:
                    raise PimError('PIM seed attributes/identity do not match catalogue')
                for field in ['name', 'brand', 'category', 'currency', 'source_version', 'published_at', 'validation_status']:
                    if row[field] != document[field]:
                        raise PimError('PIM seed field mismatch: ' + field)
                if int(row['publication_version']) != document['publication_version'] or (row['active'].lower() == 'true') != document['active']:
                    raise PimError('PIM seed publication/status mismatch')
                if self.product(document['sku']) is None:
                    self.create(document)
                    self.approve(document['sku'], preserve_timestamp=True)
