"""Additive local migrations and V3 snapshot imports. Existing conflicts fail closed."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import secrets
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import httpx
import psycopg
from bson import Int64
from dotenv import dotenv_values
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data'
LOCK = 734629205


def settings():
    env = dotenv_values(ROOT / '.env')
    if env.get('POSTGRES_DB') != 'market_db':
        raise RuntimeError('Phase 2 requires POSTGRES_DB=market_db')
    return env


def pg(database='market_db', autocommit=False):
    env = settings()
    return psycopg.connect(host='127.0.0.1', dbname=database,
                           user=env['POSTGRES_USER'], password=env['POSTGRES_PASSWORD'],
                           connect_timeout=10, autocommit=autocommit, row_factory=dict_row)


def mongo():
    env = settings()
    return MongoClient('127.0.0.1', username=env['MONGO_ROOT_USER'],
                       password=env['MONGO_ROOT_PASSWORD'], authSource='admin',
                       serverSelectionTimeoutMS=10000, tz_aware=True)


def graph(statements):
    env = settings()
    with httpx.Client(timeout=60, trust_env=False) as client:
        response = client.post('http://127.0.0.1:7474/db/neo4j/tx/commit',
                               auth=('neo4j', env['NEO4J_PASSWORD']),
                               json={'statements': statements})
        response.raise_for_status()
        payload = response.json()
        if payload['errors']:
            raise RuntimeError('Neo4j query failed: ' + payload['errors'][0]['code'])
        return [[dict(zip(result['columns'], row['row'])) for row in result['data']]
                for result in payload['results']]


def query(statement, **parameters):
    return graph([{'statement': statement, 'parameters': parameters}])[0]


def read_json(relative):
    return json.loads((DATA / relative).read_text(encoding='utf-8'))


def read_csv(relative):
    with (DATA / relative).open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream))


def timestamp(value):
    return datetime.fromisoformat(value).astimezone(UTC)


def canonical(value):
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {key: canonical(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [canonical(item) for item in value]
    return value


def migrate(connection):
    with connection.transaction():
        connection.execute('CREATE SCHEMA IF NOT EXISTS monitoring')
        connection.execute('''CREATE TABLE IF NOT EXISTS monitoring.schema_migrations
            (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())''')
    for path in sorted((DATA / 'postgres/schema/migrations').glob('*.sql')):
        content = path.read_text(encoding='utf-8')
        checksum = hashlib.sha256(content.encode()).hexdigest()
        with connection.transaction():
            previous = connection.execute('SELECT checksum FROM monitoring.schema_migrations WHERE version=%s', (path.name,)).fetchone()
            if previous:
                if previous['checksum'] != checksum:
                    raise RuntimeError('Applied migration changed: ' + path.name)
                continue
            connection.execute(content)
            connection.execute('INSERT INTO monitoring.schema_migrations(version,checksum) VALUES(%s,%s)', (path.name, checksum))
        print('Applied migration ' + path.name, flush=True)
    configure_service_logins(connection)


def configure_service_logins(connection):
    env_path = ROOT / '.env'
    env = settings()
    for schema in ['auth', 'orders', 'inventory', 'payments']:
        key = 'PG_' + schema.upper() + '_PASSWORD'
        role = 'market_' + schema + '_api'
        exists = connection.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone()
        if not env.get(key) or env[key].startswith('REPLACE_'):
            if exists:
                raise RuntimeError('Existing service login needs its local credential: ' + key)
            secret = secrets.token_urlsafe(32)
            lines = env_path.read_text(encoding='utf-8').splitlines()
            if any(line.startswith(key + '=') for line in lines):
                lines = [key + '=' + secret if line.startswith(key + '=') else line for line in lines]
            else:
                lines.append(key + '=' + secret)
            env_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
            env[key] = secret
        with connection.transaction():
            if not exists:
                connection.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {} IN ROLE {}').format(
                    sql.Identifier(role), sql.Literal(env[key]), sql.Identifier('market_' + schema)))
            connection.execute(sql.SQL('GRANT CONNECT ON DATABASE market_db TO {}').format(sql.Identifier(role)))


def int64(value):
    if type(value) is int:
        return Int64(value)
    if isinstance(value, dict):
        return {key: int64(item) for key, item in value.items()}
    if isinstance(value, list):
        return [int64(item) for item in value]
    return value


def products():
    result = []
    for source in read_json('catalog/mongodb_products.json'):
        document = int64(source)
        document['published_at'] = timestamp(document['published_at'])
        result.append(document)
    return result


def graph_data():
    nodes = []
    for source in read_csv('neo4j/product_nodes.csv'):
        attributes = json.loads(source['technical_attributes_json'])
        props = {key: source[key] for key in ['sku', 'name', 'category', 'brand', 'source_version',
                 'validation_status', 'technical_validation_version', 'published_at', 'provenance']}
        props['publication_version'] = int(source['publication_version'])
        props['technical_attributes_json'] = json.dumps(attributes, sort_keys=True, separators=(',', ':'))
        props.update({key: json.dumps(value, sort_keys=True) if isinstance(value, dict) else value
                      for key, value in attributes.items()})
        nodes.append({'product_id': int(source['product_id']), 'properties': props})
    edges = []
    for source in read_csv('neo4j/compatibility_edges.csv'):
        edges.append({'from_id': int(source['from_id']), 'to_id': int(source['to_id']),
                      'rule': source['rule'], 'relation_type': source['type'],
                      'properties': {key: source[key] for key in ['provenance', 'validation_status',
                                     'rule_version', 'validated_at', 'source_version']}})
    return nodes, edges


def configure_catalog(client):
    database = client.market_catalog
    validator = read_json('mongodb/schema/products.validator.json')
    if 'products' not in database.list_collection_names():
        database.create_collection('products', validator=validator, validationLevel='strict', validationAction='error')
    else:
        database.command('collMod', 'products', validator=validator, validationLevel='strict', validationAction='error')
    for index in read_json('mongodb/schema/products.indexes.json'):
        database.products.create_index(index['keys'], name=index['name'], unique=index.get('unique', False))


def preflight_projections(client, nodes, edges):
    for document in products():
        existing = client.market_catalog.products.find_one({'product_id': document['product_id']}, {'_id': 0})
        if existing and any(canonical(existing.get(k)) != canonical(v) for k, v in document.items()):
            raise RuntimeError('MongoDB seed conflict for product ' + str(document['product_id']))
    existing_nodes = {row['id']: row['props'] for row in query('MATCH (p:Product) RETURN p.product_id AS id, properties(p) AS props')}
    for node in nodes:
        existing = existing_nodes.get(node['product_id'])
        if existing and any(existing.get(k) != v for k, v in node['properties'].items()):
            raise RuntimeError('Neo4j seed conflict for product ' + str(node['product_id']))
    existing_edges = {(row['a'],row['b'],row['props'].get('rule'),row['props'].get('relation_type')): row['props']
                      for row in query('MATCH (a:Product)-[r:COMPATIBLE]->(b:Product) RETURN a.product_id AS a,b.product_id AS b,properties(r) AS props')}
    for edge in edges:
        existing = existing_edges.get((edge['from_id'],edge['to_id'],edge['rule'],edge['relation_type']))
        if existing and any(existing.get(k) != v for k, v in edge['properties'].items()):
            raise RuntimeError('Neo4j compatibility metadata conflicts with seed')


KEYS = {'auth.roles': ['role_id'], 'auth.users': ['user_id'], 'auth.user_roles': ['user_id','role_id'],
        'orders.customers': ['customer_id'], 'orders.orders': ['order_id'], 'orders.order_items': ['order_item_id'],
        'inventory.warehouses': ['warehouse_id'], 'inventory.stock': ['product_id','warehouse_id'],
        'inventory.reservations': ['reservation_id'], 'payments.payments': ['payment_id'],
        'payments.invoices': ['invoice_id'], 'payments.notification_deliveries': ['delivery_id'],
        'monitoring.application_logs': ['log_id']}


def insert_preserving(connection, table, record, ignore=()):
    keys = KEYS.get(table, ['event_id'])
    schema, name = table.split('.')
    where = sql.SQL(' AND ').join(sql.SQL('{}=%s').format(sql.Identifier(key)) for key in keys)
    found = connection.execute(sql.SQL('SELECT * FROM {}.{} WHERE ').format(sql.Identifier(schema), sql.Identifier(name)) + where,
                               [record[key] for key in keys]).fetchone()
    values = {key: (value.obj if isinstance(value, Jsonb) else value) for key, value in record.items()}
    if found:
        if any(canonical(found.get(key)) != canonical(value) for key, value in values.items() if key not in ignore):
            raise RuntimeError('PostgreSQL seed conflict in ' + table + ' for ' + str([record[key] for key in keys]))
        return False
    connection.execute(sql.SQL('INSERT INTO {}.{} ({}) VALUES ({})').format(
        sql.Identifier(schema), sql.Identifier(name),
        sql.SQL(',').join(map(sql.Identifier, record)), sql.SQL(',').join(sql.Placeholder() for _ in record)), list(record.values()))
    return True


def sql_rows(filename):
    records = read_csv('postgres/' + filename + '.csv')
    result = []
    for record in records:
        parsed = {}
        for key, value in record.items():
            if key.endswith('_id') or key in ['quantity','reserved_quantity','capacity_units','total_cents','unit_price_cents','amount_cents','attempts']:
                parsed[key] = int(value) if value else None
            elif key.endswith('_at'):
                parsed[key] = timestamp(value) if value else None
            elif key == 'is_active':
                parsed[key] = value.lower() == 'true'
            else:
                parsed[key] = value or None
        if filename == 'auth_users' and parsed['password_hash'].startswith('!disabled'):
            parsed['is_active'] = False
        result.append(parsed)
    return result


def seed_sql(connection):
    mapping = [('auth.roles','auth_roles'), ('auth.users','auth_users'), ('auth.user_roles','auth_user_roles'),
               ('orders.customers','customers'), ('inventory.warehouses','warehouses'),
               ('inventory.stock','stock'), ('orders.orders','orders'), ('orders.order_items','order_items'),
               ('payments.payments','payments'), ('payments.invoices','invoices'),
               ('payments.notification_deliveries','notification_deliveries'), ('inventory.reservations','reservations')]
    with connection.transaction():
        connection.execute("SELECT set_config('market.seed_snapshot','on',true)")
        for table, filename in mapping:
            for record in sql_rows(filename):
                if filename == 'stock':
                    # Reservation INSERT triggers materialize the aggregate. Never reset an existing row.
                    initial = dict(record, reserved_quantity=0)
                    insert_preserving(connection, table, initial, ignore=['reserved_quantity'])
                else:
                    insert_preserving(connection, table, record)
        for source in read_csv('monitoring/application_logs.csv'):
            insert_preserving(connection, 'monitoring.application_logs', {
                'log_id': int(source['log_id']), 'service_name': source['service'],
                'level': source['level'], 'message': source['message'], 'created_at': timestamp(source['created_at'])})
        order_ids = {row['order_id'] for row in sql_rows('orders')}
        for line in (DATA / 'kafka/events.jsonl').read_text().splitlines():
            event = json.loads(line)
            # Replay-only scenarios and unapplied product/stock updates are NOT business history.
            if event['payload'].get('order_id') not in order_ids or 'scenario_id' in event['payload']:
                continue
            prefix = event['event_type'].split('.')[0]
            owner = {'order': 'orders', 'payment': 'payments', 'inventory': 'inventory'}.get(prefix)
            if owner:
                insert_preserving(connection, owner + '.outbox_events', {
                    'event_id': UUID(event['event_id']), 'event_type': event['event_type'],
                    'event_version': event['version'], 'aggregate_id': event['aggregate_id'],
                    'payload': Jsonb(event['payload']), 'correlation_id': UUID(event['correlation_id']),
                    'occurred_at': timestamp(event['occurred_at'])})
        # Explicit fixture IDs must not leave generated identities behind the imported rows.
        for table, keys in KEYS.items():
            if len(keys) != 1 or table == 'auth.user_roles':
                continue
            schema, name = table.split('.')
            key = keys[0]
            connection.execute(sql.SQL('SELECT setval(pg_get_serial_sequence(%s,%s), greatest((SELECT coalesce(max({}),1) FROM {}.{}), (SELECT last_value FROM {}.{})), true)').format(
                sql.Identifier(key), sql.Identifier(schema), sql.Identifier(name),
                sql.Identifier(schema), sql.Identifier(name + '_' + key + '_seq')), (table, key))


def seed(connection):
    subprocess.run([sys.executable, str(DATA / 'scripts/validate_dataset.py')], check=True, cwd=ROOT)
    nodes, edges = graph_data()
    with mongo() as client:
        preflight_projections(client, nodes, edges)
        seed_sql(connection)
        configure_catalog(client)
        for document in products():
            client.market_catalog.products.update_one({'product_id': document['product_id']}, {'$setOnInsert': document}, upsert=True)
    schema_statements = [part.strip() for part in (DATA / 'neo4j/schema.cypher').read_text().split(';') if part.strip()]
    graph([{'statement': statement} for statement in schema_statements])
    statements = [part.strip() for part in (DATA / 'neo4j/import_v3.cypher').read_text().split(';') if part.strip()]
    graph([{'statement': statement, 'parameters': {'nodes': nodes, 'edges': edges}} for statement in statements])
    print('Seed import completed without overwriting existing records.', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['migrate','seed','all'], default='all', nargs='?')
    args = parser.parse_args()
    with pg('postgres', autocommit=True) as admin:
        if not admin.execute("SELECT 1 FROM pg_database WHERE datname='market_db'").fetchone():
            admin.execute('CREATE DATABASE market_db')
    with pg(autocommit=True) as connection:
        connection.execute('SELECT pg_advisory_lock(%s)', (LOCK,))
        try:
            if args.action in ('all','migrate'):
                migrate(connection)
            if args.action in ('all','seed'):
                seed(connection)
        finally:
            connection.execute('SELECT pg_advisory_unlock(%s)', (LOCK,))


if __name__ == '__main__':
    main()
