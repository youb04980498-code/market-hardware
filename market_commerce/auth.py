import hashlib
import secrets
import time
from datetime import timedelta
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field

from market_commerce.common import (
    BEARER,
    access_token,
    create_app,
    decode_access,
    env,
    event,
    fail,
    internal,
    now,
    transaction,
)

app = create_app('auth')
HASHER = PasswordHasher()
DUMMY = HASHER.hash(secrets.token_urlsafe(24))


class Register(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=3, max_length=120, pattern=r'^[a-zA-Z0-9_.@+\-]+$')
    email: str = Field(max_length=200, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    password: str = Field(min_length=12, max_length=128)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)


class Login(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=128)


class Refresh(BaseModel):
    model_config = ConfigDict(extra='forbid')
    refresh_token: str | None = Field(default=None, min_length=32, max_length=256)


REFRESH_COOKIE = 'market_refresh'
SESSION_COOKIE = 'market_session'


def cookie_secure():
    return env().get('AUTH_COOKIE_SECURE', '0').lower() in {'1', 'true', 'yes'}


def set_refresh_cookie(response, token):
    response.set_cookie(REFRESH_COOKIE, token, max_age=7 * 24 * 60 * 60,
        httponly=True, secure=cookie_secure(), samesite='strict', path='/api/auth')
    # This non-secret marker lets the SPA skip an expected 401 on anonymous startup.
    response.set_cookie(SESSION_COOKIE, '1', max_age=7 * 24 * 60 * 60,
        httponly=False, secure=cookie_secure(), samesite='strict', path='/')


def clear_refresh_cookie(response):
    response.delete_cookie(REFRESH_COOKIE, httponly=True, secure=cookie_secure(),
        samesite='strict', path='/api/auth')
    response.delete_cookie(SESSION_COOKIE, httponly=False, secure=cookie_secure(),
        samesite='strict', path='/')


def refresh_value(body, request):
    value = body.refresh_token if body and body.refresh_token else request.cookies.get(REFRESH_COOKIE)
    if not value:
        fail(401, 'UNAUTHENTICATED', 'Authentication failed')
    return value


def rate_limit(request, action):
    bucket = hashlib.sha256((action + ':' + request.client.host).encode()).hexdigest()
    window = int(time.time()) // 60
    with transaction('auth') as conn:
        row = conn.execute('''INSERT INTO auth.rate_limits(bucket,window_start,hits) VALUES(%s,%s,1)
            ON CONFLICT(bucket) DO UPDATE SET window_start=excluded.window_start,
            hits=CASE WHEN auth.rate_limits.window_start=excluded.window_start THEN auth.rate_limits.hits+1 ELSE 1 END
            RETURNING hits''', (bucket, window)).fetchone()
    if row['hits'] > int(env().get('AUTH_RATE_LIMIT', '60')):
        fail(429, 'RATE_LIMITED', 'Too many authentication requests')


def public_user(conn, row):
    names = [r['name'] for r in conn.execute('''SELECT r.name FROM auth.roles r
        JOIN auth.user_roles ur USING(role_id) WHERE ur.user_id=%s ORDER BY r.name''', (row['user_id'],))]
    return {key: row[key] for key in ['user_id', 'username', 'email', 'first_name', 'last_name']} | {
        'roles': ['staff' if name == 'operator' else name for name in names]}


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = BEARER):
    claims = decode_access(credentials.credentials if credentials else '')
    if claims['type'] != 'access':
        fail(401, 'UNAUTHENTICATED', 'Authentication failed')
    with transaction('auth') as conn:
        row = conn.execute('''SELECT u.* FROM auth.users u JOIN auth.refresh_sessions s USING(user_id)
            WHERE u.user_id=%s AND u.is_active AND s.session_id=%s AND s.revoked_at IS NULL AND s.expires_at>now()''',
            (claims['sub'], claims['sid'])).fetchone()
        if row is None:
            fail(401, 'UNAUTHENTICATED', 'Authentication failed')
        return public_user(conn, row)


def token_pair(conn, row, family=None):
    session_id = uuid4()
    refresh = secrets.token_urlsafe(48)
    conn.execute('''INSERT INTO auth.refresh_sessions(session_id,family_id,user_id,token_hash,expires_at)
        VALUES(%s,%s,%s,%s,%s)''', (session_id, family or session_id, row['user_id'],
        hashlib.sha256(refresh.encode()).hexdigest(), now() + timedelta(days=7)))
    return {'access_token': access_token(row, session_id), 'refresh_token': refresh,
            'token_type': 'bearer', 'expires_in': int(env().get('ACCESS_TOKEN_SECONDS', '900'))}, session_id


@app.post('/api/auth/register', status_code=201)
def register(body: Register, request: Request):
    rate_limit(request, 'register')
    password = HASHER.hash(body.password)
    with transaction('auth') as conn:
        row = conn.execute('''INSERT INTO auth.users(username,email,first_name,last_name,password_hash,is_active)
            VALUES(%s,%s,%s,%s,%s,true) RETURNING *''',
            (body.username.lower(), body.email.lower(), body.first_name, body.last_name, password)).fetchone()
        conn.execute("INSERT INTO auth.user_roles(user_id,role_id) SELECT %s,role_id FROM auth.roles WHERE name='customer'", (row['user_id'],))
        event(conn, 'auth', 'auth.user_registered', 'user', row['user_id'], {'user_id': row['user_id']})
        return public_user(conn, row)


@app.post('/api/auth/login')
def login(body: Login, request: Request, response: Response):
    rate_limit(request, 'login')
    with transaction('auth') as conn:
        row = conn.execute('SELECT * FROM auth.users WHERE username=%s', (body.username.lower(),)).fetchone()
    valid = row is not None and row['is_active'] and row['password_hash'].startswith('$argon2id$')
    try:
        HASHER.verify(row['password_hash'] if valid else DUMMY, body.password)
    except (VerificationError, InvalidHashError):
        valid = False
    if not valid:
        fail(401, 'UNAUTHENTICATED', 'Authentication failed')
    with transaction('auth') as conn:
        result, _ = token_pair(conn, row)
        set_refresh_cookie(response, result['refresh_token'])
        return result


@app.post('/api/auth/refresh')
def refresh(request: Request, response: Response, body: Refresh | None = None):
    rate_limit(request, 'refresh')
    supplied = refresh_value(body, request)
    result = None
    with transaction('auth') as conn:
        session = conn.execute('SELECT * FROM auth.refresh_sessions WHERE token_hash=%s FOR UPDATE',
            (hashlib.sha256(supplied.encode()).hexdigest(),)).fetchone()
        if session and session['revoked_at'] is not None:
            # Reuse revokes every successor in the family; commit revocation before returning 401.
            conn.execute('UPDATE auth.refresh_sessions SET revoked_at=coalesce(revoked_at,now()) WHERE family_id=%s', (session['family_id'],))
        elif session and session['expires_at'] > now():
            row = conn.execute('SELECT * FROM auth.users WHERE user_id=%s AND is_active', (session['user_id'],)).fetchone()
            if row:
                result, successor = token_pair(conn, row, session['family_id'])
                conn.execute('UPDATE auth.refresh_sessions SET revoked_at=now(),rotated_to=%s WHERE session_id=%s',
                             (successor, session['session_id']))
    if result is None:
        fail(401, 'UNAUTHENTICATED', 'Authentication failed')
    set_refresh_cookie(response, result['refresh_token'])
    return result


@app.post('/api/auth/logout')
def logout(request: Request, response: Response, body: Refresh | None = None):
    rate_limit(request, 'logout')
    supplied = body.refresh_token if body and body.refresh_token else request.cookies.get(REFRESH_COOKIE)
    with transaction('auth') as conn:
        if supplied:
            conn.execute('''UPDATE auth.refresh_sessions SET revoked_at=coalesce(revoked_at,now())
                WHERE family_id IN (SELECT family_id FROM auth.refresh_sessions WHERE token_hash=%s)''',
                (hashlib.sha256(supplied.encode()).hexdigest(),))
    clear_refresh_cookie(response)
    return {'status': 'revoked'}


USER = Depends(current_user)


@app.get('/api/auth/me')
def me(user=USER):
    return user


@app.get('/internal/validate', dependencies=[Depends(internal('auth', ('orders', 'inventory', 'payments')))])
def validate(user=USER):
    return user
