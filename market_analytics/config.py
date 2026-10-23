import os
from contextlib import contextmanager
from pathlib import Path

import boto3
import psycopg
from dotenv import dotenv_values
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
TOPICS = tuple('market.' + s + '.v1' for s in ('auth', 'orders', 'inventory', 'payments'))


def env():
    return {**dotenv_values(ROOT / '.env'), **os.environ}


def connect(role='writer', autocommit=False):
    c = env()
    return psycopg.connect(host=c.get('PG_HOST', '127.0.0.1'),
        dbname='market_db' if role == 'reader' else 'market_analytics',
        user='market_analytics_' + role, password=c['PG_ANALYTICS_' + role.upper() + '_PASSWORD'],
        autocommit=autocommit, connect_timeout=5, row_factory=dict_row,
        application_name='market-analytics-' + role,
        options='-c statement_timeout=30000 -c lock_timeout=3000')


def s3():
    c = env()
    from botocore.config import Config
    return boto3.client('s3', endpoint_url=c.get('ANALYTICS_S3_ENDPOINT', 'http://127.0.0.1:9000'),
        aws_access_key_id=c['MINIO_ROOT_USER'], aws_secret_access_key=c['MINIO_ROOT_PASSWORD'],
        region_name='us-east-1', config=Config(connect_timeout=3, read_timeout=10, retries={'max_attempts': 2}))


def bucket():
    return env().get('ANALYTICS_BUCKET', 'market-lakehouse')


@contextmanager
def writer_lock():
    # Session lock, not an open SQL transaction; all writer entry points use it.
    with connect(autocommit=True) as conn:
        if not conn.execute('SELECT pg_try_advisory_lock(606006) AS locked').fetchone()['locked']:
            raise RuntimeError('ANALYTICS_WRITER_ALREADY_ACTIVE')
        try:
            yield conn
        finally:
            conn.execute('SELECT pg_advisory_unlock(606006)')
