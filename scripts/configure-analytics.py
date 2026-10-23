"""Add missing credentials/roles and additive serving structures; never reseed."""
import hashlib
import secrets
import sys
from pathlib import Path

import psycopg
from dotenv import dotenv_values, set_key
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from data.seeds.phase2 import pg
from market_analytics.source import COLUMNS


def main():
    file = ROOT / '.env'
    cfg = dotenv_values(file)
    for key in ['PG_ANALYTICS_READER_PASSWORD', 'PG_ANALYTICS_WRITER_PASSWORD', 'PG_ANALYTICS_API_PASSWORD', 'ANALYTICS_PSEUDONYM_KEY']:
        if not cfg.get(key):
            cfg[key] = secrets.token_urlsafe(40)
            set_key(str(file), key, cfg[key])
    if not cfg.get('ANALYTICS_TESTING'):
        set_key(str(file), 'ANALYTICS_TESTING', '1')
    with pg(autocommit=True) as conn:
        for kind in ('reader', 'writer', 'api'):
            role = 'market_analytics_' + kind
            if not conn.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
                conn.execute(sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD {}').format(
                    sql.Identifier(role), sql.Literal(cfg['PG_ANALYTICS_' + kind.upper() + '_PASSWORD'])))
        conn.execute('GRANT CONNECT ON DATABASE market_db TO market_analytics_reader')
        conn.execute('GRANT USAGE ON SCHEMA orders,payments,inventory TO market_analytics_reader')
        for table, columns in COLUMNS.values():
            conn.execute(sql.SQL('GRANT SELECT ({}) ON {}.{} TO market_analytics_reader').format(
                sql.SQL(',').join(map(sql.Identifier, columns.split(','))), *map(sql.Identifier, table.split('.'))))
        conn.execute('ALTER ROLE market_analytics_reader SET default_transaction_read_only=on')
        conn.execute('ALTER ROLE market_analytics_api SET default_transaction_read_only=on')
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname='market_analytics'").fetchone():
            conn.execute('CREATE DATABASE market_analytics OWNER market_analytics_writer')
    with psycopg.connect(host='127.0.0.1', dbname='market_analytics', user=cfg['POSTGRES_USER'], password=cfg['POSTGRES_PASSWORD']) as conn:
        conn.execute('SET ROLE market_analytics_writer')
        conn.execute('''CREATE TABLE IF NOT EXISTS schema_migrations
            (version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())''')
        for migration in sorted((ROOT / 'data/analytics').glob('*.sql')):
            checksum = hashlib.sha256(migration.read_bytes()).hexdigest()
            applied = conn.execute('SELECT checksum FROM schema_migrations WHERE version=%s', (migration.name,)).fetchone()
            if applied:
                if applied[0] != checksum:
                    raise RuntimeError('APPLIED_ANALYTICS_MIGRATION_CHANGED:' + migration.name)
            else:
                conn.execute(migration.read_text(encoding='utf-8'))
                conn.execute('INSERT INTO schema_migrations(version,checksum) VALUES(%s,%s)', (migration.name, checksum))
    from market_analytics.config import bucket, s3
    client = s3()
    if bucket() not in [b['Name'] for b in client.list_buckets()['Buckets']]:
        client.create_bucket(Bucket=bucket())
    client.head_bucket(Bucket=bucket())
    print('Analytics roles, private lakehouse bucket and serving database ready. Existing data untouched; secrets stay in .env.')


if __name__ == '__main__':
    main()
