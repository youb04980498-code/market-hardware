import hashlib
import json
import logging
import os
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import httpx
import jwt
import psycopg
from dotenv import dotenv_values
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from starlette.exceptions import HTTPException as StarletteHTTPException

ROOT = Path(__file__).resolve().parents[1]
CORRELATION = ContextVar('commerce_correlation', default=None)
SCHEMAS = {'auth', 'orders', 'inventory', 'payments'}
LOG = logging.getLogger('commerce')
BEARER = Depends(HTTPBearer(auto_error=False))


def env():
    return {**dotenv_values(ROOT / '.env'), **os.environ}


def now():
    return datetime.now(UTC)


def correlation():
    return CORRELATION.get() or str(uuid4())


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def connection(service, autocommit=False):
    config = env()
    prefix = 'PG_' + service.upper()
    return psycopg.connect(host=config.get('PG_HOST', '127.0.0.1'), dbname='market_db',
        user='market_' + service + ('_api' if service != 'outbox' else '_worker'),
        password=config[prefix + '_PASSWORD'], connect_timeout=5, autocommit=autocommit,
        row_factory=dict_row, application_name='market-' + service,
        options='-c statement_timeout=5000 -c lock_timeout=3000')


@contextmanager
def transaction(service, key=None):
    with connection(service) as conn:
        conn.execute("SELECT set_config('market.correlation_id',%s,true)", (correlation(),))
        conn.execute("SELECT set_config('market.idempotency_key',%s,true)", (key or '',))
        conn.execute("SELECT set_config('market.causation_id',%s,true)", (str(uuid5(NAMESPACE_URL, correlation() + ':' + (key or 'request'))),))
        yield conn


def fail(status, code, message):
    raise HTTPException(status_code=status, detail={'code': code, 'message': message})


def roles(user):
    return {'staff' if role == 'operator' else role for role in user.get('roles', [])}


def require_staff(user):
    if not roles(user) & {'staff', 'admin'}:
        fail(403, 'FORBIDDEN', 'Staff authorization required')
    return user


def decode_access(token):
    config = env()
    try:
        return jwt.decode(token, config['JWT_SECRET'], algorithms=['HS256'],
            issuer=config.get('JWT_ISSUER', 'market-hardware'), audience='market-commerce',
            options={'require': ['exp', 'iat', 'sub', 'sid', 'iss', 'aud', 'type']})
    except jwt.PyJWTError:
        fail(401, 'UNAUTHENTICATED', 'Authentication failed')


def access_token(user, session_id):
    config = env()
    return jwt.encode({'sub': str(user['user_id']), 'sid': str(session_id), 'type': 'access',
        'iat': now(), 'exp': now() + timedelta(seconds=int(config.get('ACCESS_TOKEN_SECONDS', '900'))),
        'iss': config.get('JWT_ISSUER', 'market-hardware'), 'aud': 'market-commerce'}, config['JWT_SECRET'], algorithm='HS256')


def service_token(caller, target):
    return jwt.encode({'sub': caller, 'aud': target, 'iss': 'market-services', 'iat': now(),
        'exp': now() + timedelta(seconds=60)}, env()['INTERNAL_JWT_SECRET'], algorithm='HS256')


def internal(target, allowed=('orders',)):
    def dependency(request: Request):
        try:
            claims = jwt.decode(request.headers.get('X-Service-Token', ''), env()['INTERNAL_JWT_SECRET'],
                algorithms=['HS256'], issuer='market-services', audience=target,
                options={'require': ['sub', 'aud', 'iss', 'exp', 'iat']})
            if claims['sub'] not in allowed:
                raise jwt.InvalidTokenError()
            return claims['sub']
        except jwt.PyJWTError:
            fail(403, 'SERVICE_AUTH_REQUIRED', 'Trusted service authentication required')
    return dependency


class RemoteError(Exception):
    def __init__(self, status, code='UPSTREAM_UNAVAILABLE'):
        super().__init__(code)
        self.status = status
        self.code = code


def remote(caller, target, method, path, body=None, bearer=None):
    config = env()
    base = config.get(target.upper().replace('-', '_') + '_URL', 'http://' + target + ':8080')
    headers = {'X-Service-Token': service_token(caller, target), 'X-Correlation-ID': correlation()}
    if bearer:
        headers['Authorization'] = 'Bearer ' + bearer
    try:
        with httpx.Client(timeout=httpx.Timeout(5, connect=2), trust_env=False) as client:
            response = client.request(method, base + path, json=body, headers=headers)
        if response.status_code >= 400:
            code = response.json().get('error', {}).get('code', 'UPSTREAM_REJECTED')
            raise RemoteError(response.status_code, code)
        return response.json()
    except (httpx.HTTPError, ValueError):
        raise RemoteError(503) from None


def authenticated(service):
    def dependency(request: Request, credentials: HTTPAuthorizationCredentials | None = BEARER):
        if credentials is None:
            fail(401, 'UNAUTHENTICATED', 'Authentication failed')
        token = credentials.credentials
        claims = decode_access(token)
        if claims.get('type') != 'access':
            fail(401, 'UNAUTHENTICATED', 'Authentication failed')
        try:
            return remote(service, 'auth', 'GET', '/internal/validate', bearer=token)
        except RemoteError as exc:
            if exc.status in (401, 403):
                fail(401, 'UNAUTHENTICATED', 'Authentication failed')
            fail(503, 'AUTH_UNAVAILABLE', 'Authentication service unavailable')
    return dependency


def event(conn, schema, kind, aggregate_type, aggregate_id, payload, key=None):
    if schema not in SCHEMAS:
        raise ValueError('Unknown event owner')
    cid = correlation()
    conn.execute(f'''INSERT INTO {schema}.outbox_events(event_id,event_type,event_version,aggregate_type,
        aggregate_id,payload,correlation_id,causation_id,idempotency_key,occurred_at)
        VALUES(%s,%s,1,%s,%s,%s,%s,%s,%s,now())''',
        (uuid4(), kind, aggregate_type, str(aggregate_id), Jsonb(payload), cid, uuid5(NAMESPACE_URL, cid + ':' + (key or 'request')), key))


def create_app(service):
    app = FastAPI(title='Market Hardware ' + service.title(), docs_url=f'/api/{service}/docs',
                  openapi_url=f'/api/{service}/openapi.json', redoc_url=None)
    def public_openapi():
        if app.openapi_schema is None:
            app.openapi_schema = get_openapi(title=app.title, version='4.0.0',
                routes=[r for r in app.routes if not r.path.startswith('/internal/')])
        return app.openapi_schema
    app.openapi = public_openapi
    app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                       allow_credentials=True, allow_methods=['GET', 'POST', 'OPTIONS'],
                       allow_headers=['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Correlation-ID'],
                       expose_headers=['X-Correlation-ID'])

    @app.middleware('http')
    async def request_context(request, call_next):
        try:
            cid = str(UUID(request.headers.get('X-Correlation-ID', str(uuid4()))))
        except ValueError:
            cid = str(uuid4())
        token = CORRELATION.set(cid)
        try:
            response = await call_next(request)
            response.headers['X-Correlation-ID'] = cid
            return response
        finally:
            CORRELATION.reset(token)

    def error_response(status, code, message, details=None):
        return JSONResponse(status_code=status, content={'error': {'code': code, 'message': message,
            **({'details': details} if details else {})}, 'correlation_id': correlation()})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        detail = exc.detail if isinstance(exc.detail, dict) else {'code': 'REQUEST_FAILED', 'message': str(exc.detail)}
        return error_response(exc.status_code, detail['code'], detail['message'])

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error_response(422, 'INVALID_INPUT', 'Request validation failed',
            [{'field': '.'.join(map(str, e['loc'])), 'message': e['msg']} for e in exc.errors()])

    @app.exception_handler(psycopg.Error)
    async def database_error(request, exc):
        LOG.error('Database failure service=%s type=%s correlation=%s', service, type(exc).__name__, correlation())
        if isinstance(exc, (psycopg.IntegrityError, psycopg.errors.LockNotAvailable, psycopg.errors.DeadlockDetected)):
            return error_response(409, 'STATE_CONFLICT', 'Operation conflicts with current state')
        return error_response(503, 'DATABASE_UNAVAILABLE', 'Database temporarily unavailable')

    @app.exception_handler(RemoteError)
    async def remote_error(request, exc):
        return error_response(503 if exc.status >= 500 else exc.status, exc.code, 'Upstream operation could not complete')

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        LOG.error('Unhandled failure service=%s type=%s correlation=%s', service, type(exc).__name__, correlation())
        return error_response(500, 'INTERNAL_ERROR', 'Request could not complete')

    @app.get('/health')
    @app.get('/api/' + service + '/health')
    def health():
        with transaction(service) as conn:
            conn.execute('SELECT 1')
        if service != 'auth':
            remote(service, 'auth', 'GET', '/health')
        if service == 'orders':
            remote(service, 'inventory', 'GET', '/health')
            remote(service, 'payments', 'GET', '/health')
            try:
                with httpx.Client(timeout=5, trust_env=False) as client:
                    result = client.get(env().get('CATALOG_HEALTH_URL', 'http://catalog-graphql:8080/health'))
                    result.raise_for_status()
            except httpx.HTTPError:
                fail(503, 'CATALOGUE_UNAVAILABLE', 'Catalogue dependency unavailable')
        return {'status': 'ok', 'service': service}

    return app
