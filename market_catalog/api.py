"""Read-only typed GraphQL catalogue. Stock remains outside this service."""
import logging
from contextlib import asynccontextmanager
from enum import Enum

import strawberry
from fastapi import FastAPI, HTTPException
from graphql import GraphQLError
from starlette.concurrency import run_in_threadpool
from strawberry.extensions import QueryDepthLimiter
from strawberry.fastapi import GraphQLRouter
from strawberry.scalars import JSON

from market_catalog import graph
from market_catalog.config import mongo

LOG = logging.getLogger('catalog-graphql')


@strawberry.enum
class Category(Enum):
    CPU = 'CPU'
    MOTHERBOARD = 'MOTHERBOARD'
    RAM = 'RAM'
    GPU = 'GPU'
    SSD = 'SSD'
    PSU = 'PSU'
    CASE = 'CASE'
    COOLER = 'COOLER'
    PERIPHERAL = 'PERIPHERAL'


@strawberry.type
class Product:
    product_id: strawberry.ID
    sku: str
    name: str
    description: str
    brand: str
    category: Category
    price_cents: int
    currency: str
    active: bool
    attributes: JSON
    source_version: str
    source_revision: int
    publication_version: int
    published_at: str
    source_system: str
    validation_status: str
    technical_validation_version: str


@strawberry.type
class ProductPage:
    items: list[Product]
    total: int
    page: int
    page_size: int
    has_next: bool


@strawberry.type
class CompatibilityCandidate:
    product: Product
    rule: str
    rule_version: str
    provenance: str
    validation_status: str


def identifier(value):
    try:
        result = int(value)
        if result < 1 or result > 2 ** 63 - 1:
            raise ValueError
        return result
    except (ValueError, TypeError):
        raise GraphQLError('Product ID must be a positive 64-bit integer', extensions={'code': 'BAD_USER_INPUT'}) from None


def product_type(document):
    fields = {field: document[field] for field in ['sku', 'name', 'brand', 'price_cents', 'currency',
        'active', 'attributes', 'source_revision', 'publication_version', 'source_system',
        'validation_status', 'technical_validation_version']}
    return Product(product_id=strawberry.ID(str(document['product_id'])),
        category=Category(document['category']), description=document.get('description', ''),
        source_version=str(document['source_version']), published_at=document['published_at'].isoformat(), **fields)


class Catalogue:
    def __init__(self, client):
        self.products = client.market_catalog.products

    def get(self, predicate, include_inactive=False):
        document = self.products.find_one({**predicate, 'sync_state': 'READY',
            **({} if include_inactive else {'active': True})}, {'_id': 0})
        return product_type(document) if document else None

    def listing(self, category=None, brand=None, min_price_cents=None, max_price_cents=None,
                search=None, page=1, page_size=20, include_inactive=False):
        if page < 1 or page > 10000 or page_size < 1 or page_size > 100:
            raise GraphQLError('Page must be 1..10000 and pageSize 1..100', extensions={'code': 'BAD_USER_INPUT'})
        if any(price is not None and price < 0 for price in [min_price_cents, max_price_cents]):
            raise GraphQLError('Prices must be nonnegative integer cents')
        if min_price_cents is not None and max_price_cents is not None and min_price_cents > max_price_cents:
            raise GraphQLError('minPriceCents cannot exceed maxPriceCents')
        predicate = {'sync_state': 'READY'}
        if not include_inactive:
            predicate['active'] = True
        if category:
            predicate['category'] = category.value
        if brand is not None:
            if not brand.strip() or len(brand) > 100:
                raise GraphQLError('Brand must contain 1..100 characters')
            predicate['brand'] = brand.strip()
        if search is not None:
            if not search.strip() or len(search) > 100:
                raise GraphQLError('Search must contain 1..100 characters')
            predicate['$text'] = {'$search': search.strip()}
        price = {}
        if min_price_cents is not None:
            price['$gte'] = min_price_cents
        if max_price_cents is not None:
            price['$lte'] = max_price_cents
        if price:
            predicate['price_cents'] = price
        total = self.products.count_documents(predicate, maxTimeMS=5000)
        rows = self.products.find(predicate, {'_id': 0}).sort('product_id', 1).skip((page - 1) * page_size).limit(page_size).max_time_ms(5000)
        return ProductPage(items=[product_type(row) for row in rows], total=total, page=page,
                           page_size=page_size, has_next=page * page_size < total)

    def compatibility(self, product_id, category):
        source = self.products.find_one({'product_id': product_id, 'sync_state': 'READY', 'active': True})
        if source is None:
            return []
        rows = graph.compatible(product_id, category.value if category else None)
        result = []
        for row in rows:
            if row['source_version'] != source['publication_version'] or row['source_digest'] != source['publication_digest']:
                continue
            other = self.products.find_one({'product_id': row['id'], 'active': True, 'sync_state': 'READY',
                'publication_version': row['version'], 'publication_digest': row['digest']})
            if other is None:
                continue
            versions = (source['publication_version'], other['publication_version'])
            edge_versions = (row['from_version'], row['to_version'])
            if row['from_id'] != product_id:
                edge_versions = edge_versions[::-1]
            if versions != edge_versions:
                continue
            result.append(CompatibilityCandidate(product=product_type(other), rule=row['rule'],
                rule_version=row['rule_version'], provenance=row['provenance'], validation_status=row['validation_status']))
        return result

    def distinct(self, field, category=None):
        predicate = {'sync_state': 'READY', 'active': True}
        if category:
            predicate['category'] = category.value
        return sorted(self.products.distinct(field, predicate))


def read(info, method, *args, **kwargs):
    try:
        return getattr(info.context['catalogue'], method)(*args, **kwargs)
    except GraphQLError:
        raise
    except Exception as exc:  # noqa: BLE001 -- public boundary masks dependency details
        LOG.error('Catalogue read failed: %s', type(exc).__name__)
        raise GraphQLError('Catalogue temporarily unavailable', extensions={'code': 'SERVICE_UNAVAILABLE'}) from None


@strawberry.type
class Query:
    @strawberry.field
    async def products(self, info: strawberry.Info, category: Category | None = None, brand: str | None = None,
                 min_price_cents: int | None = None, max_price_cents: int | None = None,
                 search: str | None = None, page: int = 1, page_size: int = 20,
                 include_inactive: bool = False) -> ProductPage:
        return await run_in_threadpool(read, info, 'listing', category, brand, min_price_cents, max_price_cents, search, page, page_size, include_inactive)

    @strawberry.field
    async def product(self, info: strawberry.Info, id: strawberry.ID | None = None,
                product_id: strawberry.ID | None = None, include_inactive: bool = False) -> Product | None:
        if (id is None) == (product_id is None):
            raise GraphQLError('Provide exactly one of id or productId')
        return await run_in_threadpool(read, info, 'get', {'product_id': identifier(id if id is not None else product_id)}, include_inactive)

    @strawberry.field
    async def product_by_sku(self, info: strawberry.Info, sku: str, include_inactive: bool = False) -> Product | None:
        if not sku.strip() or len(sku) > 150:
            raise GraphQLError('SKU must contain 1..150 characters')
        return await run_in_threadpool(read, info, 'get', {'sku': sku}, include_inactive)

    @strawberry.field
    async def categories(self, info: strawberry.Info) -> list[Category]:
        return [Category(value) for value in await run_in_threadpool(read, info, 'distinct', 'category')]

    @strawberry.field
    async def brands(self, info: strawberry.Info, category: Category | None = None) -> list[str]:
        return await run_in_threadpool(read, info, 'distinct', 'brand', category)

    @strawberry.field
    async def compatible_products(self, info: strawberry.Info, product_id: strawberry.ID,
                            category: Category | None = None) -> list[CompatibilityCandidate]:
        return await run_in_threadpool(read, info, 'compatibility', identifier(product_id), category)


schema = strawberry.Schema(query=Query, extensions=[QueryDepthLimiter(max_depth=8)])


@asynccontextmanager
async def lifespan(application):
    application.state.client = mongo('read')
    application.state.catalogue = Catalogue(application.state.client)
    yield
    application.state.client.close()


app = FastAPI(title='Market Hardware Catalogue', lifespan=lifespan)


async def context():
    return {'catalogue': app.state.catalogue}


app.include_router(GraphQLRouter(schema, context_getter=context, graphql_ide='graphiql'), prefix='/graphql')


@app.get('/health')
def health():
    try:
        app.state.client.admin.command('ping')
        graph.query('RETURN 1 AS ready')
        return {'status': 'ok'}
    except Exception:  # noqa: BLE001 -- readiness boundary
        raise HTTPException(status_code=503, detail='Catalogue dependencies unavailable') from None
