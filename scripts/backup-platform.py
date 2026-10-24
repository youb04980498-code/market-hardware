"""Non-destructive exports and isolated restore checks. Artifacts contain private data."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from data.seeds.phase2 import graph, mongo, pg
from market_analytics.config import s3


def docker(*args, data=None):
    result = subprocess.run(['docker', *args], input=data, capture_output=True, cwd=ROOT, check=False)
    if result.returncode:
        raise RuntimeError('Docker backup command failed: ' + args[0])
    return result.stdout


def backup_pim(target):
    import shutil
    config_dir = target / 'private-config'
    config_dir.mkdir(exist_ok=True)
    for name in ('.env', 'infrastructure/unopim/.env'):
        source = ROOT / name
        if source.exists():
            shutil.copy2(source, config_dir / ('root.env' if name == '.env' else 'unopim.env'))
    dump = docker('compose', 'exec', '-T', 'unopim-pgsql', 'sh', '-c',
        'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc')
    (target / 'unopim.dump').write_bytes(dump)
    print('Private PIM config/database backup saved locally.', flush=True)


def main(restore=False):
    began = time.monotonic()
    identity = datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ') + '_' + uuid4().hex[:6]
    target = ROOT / '.local' / 'backups' / identity
    target.mkdir(parents=True)
    report = {'identity': identity, 'started_at': datetime.now(UTC).isoformat(), 'stores': {}}
    # pg_dump and expected counts share one exported repeatable-read snapshot.
    with pg() as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        snapshot = conn.execute('SELECT pg_export_snapshot() AS id').fetchone()['id']
        tables = conn.execute("""SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN
            ('auth','orders','inventory','payments','monitoring') ORDER BY 1,2""").fetchall()
        counts = {}
        for row in tables:
            key = row['schemaname'] + '.' + row['tablename']
            counts[key] = conn.execute(sql.SQL('SELECT count(*) AS n FROM {}.{}').format(
                sql.Identifier(row['schemaname']), sql.Identifier(row['tablename']))).fetchone()['n']
        dump = docker('compose', 'exec', '-T', 'postgres', 'sh', '-c',
            'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d market_db -Fc --snapshot=' + snapshot)
    (target / 'market_db.dump').write_bytes(dump)
    report['stores']['postgres'] = {'bytes': len(dump), 'table_counts': counts, 'restore': 'NOT_RUN'}
    archive = docker('compose', 'exec', '-T', 'mongo', 'sh', '-c',
        'exec mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db market_catalog --archive --gzip')
    (target / 'market_catalog.archive.gz').write_bytes(archive)
    products = list(mongo().market_catalog.products.find({}, {'_id': 0}))
    report['stores']['mongodb'] = {'bytes': len(archive), 'products': len(products), 'restore': 'NOT_RUN'}
    nodes, relationships = graph([
        {'statement': 'MATCH (n) RETURN elementId(n) AS id,labels(n) AS labels,properties(n) AS properties'},
        {'statement': 'MATCH (a)-[r]->(b) RETURN elementId(a) AS start,elementId(b) AS end,type(r) AS type,properties(r) AS properties'}])
    (target / 'neo4j.json').write_text(json.dumps({'nodes': nodes, 'relationships': relationships}), encoding='utf-8')
    report['stores']['neo4j'] = {'nodes': len(nodes), 'relationships': len(relationships), 'restore': 'NOT_RUN'}
    client = s3()
    objects = []
    for bucket in client.list_buckets()['Buckets']:
        name = bucket['Name']
        if name.startswith('market-restore-'):
            continue
        for page in client.get_paginator('list_objects_v2').paginate(Bucket=name):
            for item in page.get('Contents', []):
                body = client.get_object(Bucket=name, Key=item['Key'])['Body'].read()
                filename = hashlib.sha256((name + '/' + item['Key']).encode()).hexdigest()
                (target / filename).write_bytes(body)
                objects.append({'bucket': name, 'key': item['Key'], 'file': filename,
                    'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)})
    (target / 'minio-manifest.json').write_text(json.dumps(objects, indent=2), encoding='utf-8')
    report['stores']['minio'] = {'objects': len(objects), 'bytes': sum(o['bytes'] for o in objects), 'restore': 'NOT_RUN'}
    if restore:
        database = 'market_restore_' + uuid4().hex[:12]
        with pg(autocommit=True) as conn:
            conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
        docker('compose', 'exec', '-T', 'postgres', 'sh', '-c',
            'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_restore -U "$POSTGRES_USER" --no-owner --no-privileges --exit-on-error -d ' + database, data=dump)
        with pg(database) as conn:
            for key, expected in counts.items():
                schema, table = key.split('.')
                actual = conn.execute(sql.SQL('SELECT count(*) AS n FROM {}.{}').format(sql.Identifier(schema), sql.Identifier(table))).fetchone()['n']
                if actual != expected:
                    raise RuntimeError('Postgres restored row count differs: ' + key)
        report['stores']['postgres'].update(restore='PASS', isolated_database=database)
        mongo_database = 'market_restore_' + uuid4().hex[:12]
        docker('compose', 'exec', '-T', 'mongo', 'sh', '-c',
            'exec mongorestore --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --nsFrom "market_catalog.*" --nsTo "' + mongo_database + '.*"', data=archive)
        restored = list(mongo()[mongo_database].products.find({}, {'_id': 0}))
        def normalize(rows):
            return sorted(json.dumps(row, sort_keys=True, default=str) for row in rows)
        if normalize(restored) != normalize(products):
            raise RuntimeError('MongoDB restored product documents differ')
        report['stores']['mongodb'].update(restore='PASS', isolated_database=mongo_database)
        # An isolated Neo4j container: no live graph changes, no live volume mounts.
        container = 'market-restore-neo4j-' + uuid4().hex[:8]
        password = uuid4().hex
        child_env = {**os.environ, 'NEO4J_AUTH': 'neo4j/' + password}
        subprocess.run(['docker', 'run', '-d', '--name', container, '--network', 'market-hardware_default',
            '-e', 'NEO4J_AUTH', '-e', 'NEO4J_server_memory_heap_max__size=256m',
            '-e', 'NEO4J_server_memory_pagecache_size=128m', 'neo4j:5.26-community'],
            env=child_env, capture_output=True, check=True)
        try:
            deadline = time.monotonic() + 120
            while True:
                probe = subprocess.run(['docker', 'exec', container, 'sh', '-c',
                    'printf "RETURN 1;" | cypher-shell -u neo4j -p "${NEO4J_AUTH#*/}"'], capture_output=True, check=False)
                if probe.returncode == 0:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError('Isolated Neo4j not ready')
                time.sleep(2)
            # Execute inside the existing Python image; no graph credentials enter command output.
            program = '''import json,sys,httpx
d=json.load(sys.stdin)
statements=[]
for n in d['nodes']:
 labels=':'.join('`'+label.replace('`','``')+'`' for label in n['labels'])
 statements.append({'statement':'CREATE (n:'+labels+') SET n=$props,n.restore_id=$id','parameters':{'props':n['properties'],'id':n['id']}})
for r in d['relationships']:
 kind='`'+r['type'].replace('`','``')+'`'
 statements.append({'statement':'MATCH(a {restore_id:$start}),(b {restore_id:$end}) CREATE(a)-[r:'+kind+']->(b) SET r=$props','parameters':{'start':r['start'],'end':r['end'],'props':r['properties']}})
result=httpx.post('http://'+d['host']+':7474/db/neo4j/tx/commit',auth=('neo4j',d['password']),json={'statements':statements},timeout=90).json()
assert not result['errors']
result=httpx.post('http://'+d['host']+':7474/db/neo4j/tx/commit',auth=('neo4j',d['password']),json={'statements':[{'statement':'MATCH(n) RETURN count(n)'},{'statement':'MATCH()-[r]->() RETURN count(r)'}]},timeout=30).json()
assert result['results'][0]['data'][0]['row'][0]==len(d['nodes'])
assert result['results'][1]['data'][0]['row'][0]==len(d['relationships'])
print('Isolated Neo4j counts PASS')'''
            payload = json.dumps({'nodes': nodes, 'relationships': relationships, 'host': container, 'password': password}).encode()
            docker('compose', 'exec', '-T', 'auth', 'python', '-c', program, data=payload)
            report['stores']['neo4j'].update(restore='PASS', isolated_container=container)
        finally:
            docker('stop', container)
        restore_bucket = 'market-restore-' + uuid4().hex[:12]
        client.create_bucket(Bucket=restore_bucket)
        for item in objects:
            body = (target / item['file']).read_bytes()
            key = item['bucket'] + '/' + item['key']
            client.put_object(Bucket=restore_bucket, Key=key, Body=body)
            recovered = client.get_object(Bucket=restore_bucket, Key=key)['Body'].read()
            if hashlib.sha256(recovered).hexdigest() != item['sha256']:
                raise RuntimeError('MinIO restored object checksum mismatch')
        report['stores']['minio'].update(restore='PASS', isolated_bucket=restore_bucket)
    backup_pim(target)
    report['duration_seconds'] = round(time.monotonic() - began, 3)
    (target / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'report': str(target / 'report.json'), 'duration_seconds': report['duration_seconds'],
        'restores': {k: v['restore'] for k, v in report['stores'].items()}}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--restore-isolated', action='store_true')
    main(parser.parse_args().restore_isolated)
