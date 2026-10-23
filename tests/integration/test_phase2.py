"""Live local database checks. SQL mutation probes always roll back."""
import copy
import hashlib
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg
import pytest
from pymongo.errors import DuplicateKeyError, WriteError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'data/seeds'))
import phase2 as db


@pytest.fixture
def connection():
    connection = db.pg()
    connection.execute('SELECT 1')  # Outer transaction; probes use nested savepoints.
    try:
        yield connection
    finally:
        connection.rollback()
        connection.close()


def test_postgres_counts_and_schema_boundaries(connection):
    expected = {'auth.roles':3, 'auth.users':22, 'auth.user_roles':22,
                'orders.customers':20, 'orders.orders':72, 'orders.order_items':140,
                'inventory.warehouses':3, 'inventory.stock':126, 'inventory.reservations':6,
                'payments.payments':67, 'payments.invoices':61,
                'payments.notification_deliveries':61, 'monitoring.application_logs':80}
    for table, count in expected.items():
        assert connection.execute('SELECT count(*) AS n FROM '+table).fetchone()['n'] >= count
    # Phase 4 adds retained, isolated commerce records; verify every historical source row itself.
    mapping = {'auth.roles':'auth_roles','auth.users':'auth_users','auth.user_roles':'auth_user_roles',
        'orders.customers':'customers','orders.orders':'orders','orders.order_items':'order_items',
        'inventory.warehouses':'warehouses','inventory.stock':'stock','inventory.reservations':'reservations',
        'payments.payments':'payments','payments.invoices':'invoices','payments.notification_deliveries':'notification_deliveries'}
    for table, source in mapping.items():
        for expected_row in db.sql_rows(source):
            keys = db.KEYS[table]
            actual = connection.execute('SELECT * FROM '+table+' WHERE '+' AND '.join(k+'=%s' for k in keys), [expected_row[k] for k in keys]).fetchone()
            mutable = {'quantity', 'reserved_quantity'} if table == 'inventory.stock' else set()
            assert actual and all(
                k in mutable or db.canonical(actual[k]) == db.canonical(v)
                for k, v in expected_row.items()
            )
    schemas = connection.execute("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')").fetchall()
    assert {row['nspname'] for row in schemas} == {'auth','orders','inventory','payments','monitoring'}
    assert not connection.execute('''SELECT 1 FROM pg_constraint c JOIN pg_class a ON a.oid=c.conrelid
        JOIN pg_class b ON b.oid=c.confrelid WHERE c.contype='f' AND a.relnamespace<>b.relnamespace''').fetchall()


def test_relational_and_financial_consistency(connection):
    checks = [
        'SELECT 1 FROM orders.orders o LEFT JOIN orders.customers c USING(customer_id) WHERE c.customer_id IS NULL',
        '''SELECT 1 FROM orders.orders o LEFT JOIN orders.order_items i USING(order_id)
           GROUP BY o.order_id HAVING o.total_cents<>coalesce(sum(i.quantity::numeric*i.unit_price_cents),0)''',
        '''SELECT 1 FROM payments.payments p LEFT JOIN orders.orders o USING(order_id)
           WHERE o.order_id IS NULL OR p.amount_cents<>o.total_cents''',
        '''SELECT 1 FROM payments.invoices i JOIN payments.payments p USING(payment_id)
           WHERE i.order_id<>p.order_id OR i.total_cents<>p.amount_cents OR p.status NOT IN ('SUCCEEDED','REFUNDED')''',
        '''SELECT 1 FROM inventory.reservations r LEFT JOIN orders.order_items i USING(order_id,product_id)
           WHERE i.order_id IS NULL OR r.quantity>i.quantity''',
        '''SELECT 1 FROM inventory.stock s LEFT JOIN inventory.reservations r
           ON r.product_id=s.product_id AND r.warehouse_id=s.warehouse_id AND r.status='ACTIVE'
           GROUP BY s.product_id,s.warehouse_id HAVING s.reserved_quantity<>coalesce(sum(r.quantity),0)''',
        '''SELECT 1 FROM payments.payments p JOIN orders.orders o USING(order_id)
           WHERE (p.status='SUCCEEDED' AND o.status<>'PAID') OR (p.status='REFUNDED' AND o.status<>'REFUNDED')''']
    for statement in checks:
        assert connection.execute(statement).fetchall() == []


@pytest.mark.parametrize('statement', [
    "INSERT INTO orders.customers(customer_id,first_name,last_name,email) VALUES(999001,'test','test',NULL)",
    "INSERT INTO orders.orders(order_id,customer_id,status,total_cents) VALUES(999001,999999,'PENDING',0)",
    "INSERT INTO orders.orders(order_id,customer_id,status,total_cents) VALUES(999001,1,'PENDING',-1)",
    "INSERT INTO orders.orders(order_id,customer_id,status,total_cents) VALUES(999001,1,'PENDING',1)",
    "INSERT INTO orders.order_items(order_item_id,order_id,product_id,quantity,unit_price_cents) VALUES(999001,5012,1001,0,1)",
    "INSERT INTO inventory.stock(product_id,warehouse_id,quantity) VALUES(999001,999999,1)",
    "UPDATE inventory.stock SET reserved_quantity=quantity+1 WHERE product_id=1001 AND warehouse_id=1",
    "UPDATE inventory.warehouses SET capacity_units=0 WHERE warehouse_id=1",
    "INSERT INTO payments.payments(payment_id,order_id,amount_cents,status,method,idempotency_key) VALUES(999001,5002,0,'PENDING','SIMULATED_CARD','seed-payment-5002')",
    "INSERT INTO payments.invoices(invoice_id,order_id,payment_id,invoice_number,issued_at,total_cents,pdf_object_key,status) VALUES(999001,5012,7011,'test-phase2',now(),1,'test.pdf','ISSUED')",
    "INSERT INTO auth.user_roles(user_id,role_id) VALUES(999999,1)",
    "UPDATE auth.users SET is_active=true WHERE user_id=1",
    "UPDATE orders.orders SET status='PENDING' WHERE order_id=5002",
    "UPDATE orders.order_items SET unit_price_cents=0 WHERE order_id=5002",
    "INSERT INTO orders.orders(order_id,customer_id,status,total_cents) VALUES(999001,1,'PAID',0)",
    "UPDATE payments.invoices SET invoice_number='changed' WHERE invoice_id=9001",
])
def test_database_rejects_invalid_records(connection, statement):
    with pytest.raises(psycopg.Error), connection.transaction():
        connection.execute(statement)
        connection.execute('SET CONSTRAINTS ALL IMMEDIATE')


def test_reservation_idempotence_and_release(connection):
    before = connection.execute('SELECT reserved_quantity FROM inventory.stock WHERE product_id=1001 AND warehouse_id=1').fetchone()['reserved_quantity']
    first = connection.execute('SELECT * FROM inventory.create_reservation(999001,1001,1,1)').fetchone()
    second = connection.execute('SELECT * FROM inventory.create_reservation(999001,1001,1,1)').fetchone()
    assert first['reservation_id'] == second['reservation_id']
    assert connection.execute('SELECT reserved_quantity FROM inventory.stock WHERE product_id=1001 AND warehouse_id=1').fetchone()['reserved_quantity'] == before+1
    connection.execute("UPDATE inventory.reservations SET status='RELEASED' WHERE reservation_id=%s", (first['reservation_id'],))
    connection.execute("UPDATE inventory.reservations SET status='RELEASED' WHERE reservation_id=%s", (first['reservation_id'],))
    assert connection.execute('SELECT reserved_quantity FROM inventory.stock WHERE product_id=1001 AND warehouse_id=1').fetchone()['reserved_quantity'] == before
    connection.execute('SET CONSTRAINTS ALL IMMEDIATE')


def test_over_reservation_rejected(connection):
    with pytest.raises(psycopg.errors.CheckViolation), connection.transaction():
        connection.execute('SELECT inventory.create_reservation(999001,1001,1,1000000)')


def test_concurrent_reservation_serialization(connection):
    available = connection.execute('SELECT quantity-reserved_quantity AS n FROM inventory.stock WHERE product_id=1001 AND warehouse_id=1').fetchone()['n']
    connection.execute('SELECT inventory.create_reservation(999001,1001,1,%s)', (available,))

    def contender():
        with db.pg() as other:
            other.execute("SET LOCAL lock_timeout='500ms'")
            with pytest.raises(psycopg.errors.LockNotAvailable):
                other.execute('SELECT inventory.create_reservation(999002,1001,1,1)')
            other.rollback()
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(contender).result(timeout=10)
    connection.execute('SET CONSTRAINTS ALL IMMEDIATE')


def test_outbox_is_transactional(connection):
    connection.execute("INSERT INTO orders.orders(order_id,customer_id,status,total_cents) VALUES(999001,1,'PENDING',0)")
    assert connection.execute("SELECT count(*) AS n FROM orders.outbox_events WHERE aggregate_id='999001'").fetchone()['n'] == 1
    connection.rollback()
    assert connection.execute("SELECT count(*) AS n FROM orders.outbox_events WHERE aggregate_id='999001'").fetchone()['n'] == 0


@pytest.mark.parametrize('schema', ['auth','orders','inventory','payments'])
def test_service_login_isolation(schema):
    env = db.settings()
    with psycopg.connect(host='127.0.0.1', dbname='market_db', user='market_'+schema+'_api',
                         password=env['PG_'+schema.upper()+'_PASSWORD']) as connection:
        table = {'auth':'users','orders':'orders','inventory':'stock','payments':'payments'}[schema]
        connection.execute('SELECT count(*) FROM '+schema+'.'+table)
        other = 'auth.users' if schema!='auth' else 'orders.orders'
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            connection.execute('SELECT * FROM '+other)
        connection.rollback()


def test_catalog_validation_indexes_and_metadata():
    with db.mongo() as client:
        collection = client.market_catalog.products
        count = collection.count_documents({})
        assert count >= 42
        assert collection.count_documents({'product_id': {'$type':'long'}, 'price_cents': {'$type':'long'}}) == count
        for expected in db.products():
            actual = collection.find_one({'product_id':expected['product_id']}, {'_id':0})
            assert actual is not None
            if actual['publication_version'] == 1:
                assert all(db.canonical(actual.get(k)) == db.canonical(v) for k,v in expected.items())
            else:
                assert actual.get('publication_digest') and actual.get('sync_state') == 'READY'
        assert collection.index_information()['sku_unique']['unique']
        assert collection.index_information()['product_id_unique']['unique']
        invalid = copy.deepcopy(db.products()[0])
        invalid['product_id'] = 'invalid-id'
        with pytest.raises(WriteError):
            collection.insert_one(invalid)
        with pytest.raises(DuplicateKeyError):
            collection.insert_one(copy.deepcopy(db.products()[0]))
        invalid = copy.deepcopy(db.products()[0])
        invalid['attributes']['tdp_w'] = -1
        with pytest.raises(WriteError):
            collection.insert_one(invalid)


def test_graph_and_cross_database_ids(connection):
    nodes, edges = db.graph_data()
    actual_nodes = {row['id']:row['props'] for row in db.query('MATCH (p:Product) RETURN p.product_id AS id,properties(p) AS props')}
    with db.mongo() as client:
        catalogue = {p['product_id']:p for p in client.market_catalog.products.find({}, {'_id':0})}
        mongo_ids = set(catalogue)
    stock_ids = {row['product_id'] for row in connection.execute('SELECT DISTINCT product_id FROM inventory.stock')}
    assert mongo_ids == set(actual_nodes)
    assert stock_ids == {n['product_id'] for n in nodes}
    assert stock_ids <= mongo_ids  # New PIM products need not have Inventory stock yet.
    for node in nodes:
        actual = actual_nodes[node['product_id']]
        product = catalogue[node['product_id']]
        if product['publication_version'] == 1:
            assert all(actual.get(k)==v for k,v in node['properties'].items())
        else:
            assert actual['publication_version'] == product['publication_version']
            assert actual['source_version'] == product['source_version']
            assert json.loads(actual['technical_attributes_json']) == product['attributes']
    actual_edges = db.query('MATCH (a:Product)-[r:COMPATIBLE]->(b:Product) RETURN a.product_id AS a,b.product_id AS b,properties(r) AS props')
    assert len(actual_edges) == len(edges) == 163
    expected = {(e['from_id'],e['to_id'],e['rule'],e['relation_type']):e['properties'] for e in edges}
    for row in actual_edges:
        props = row['props']
        reference = expected[(row['a'],row['b'],props['rule'],props['relation_type'])]
        keys = ['provenance','rule_version','source_version']
        assert all(props.get(k)==reference[k] for k in keys)
        if 'from_publication_version' in props:
            from market_catalog.graph import valid_pair
            valid = valid_pair(props['relation_type'], catalogue[row['a']], catalogue[row['b']])
            assert (props['validation_status'] == 'RULE_VALIDATED') == valid
        else:
            assert props['validation_status'] == reference['validation_status']
    assert not db.query('MATCH (a)-[r:COMPATIBLE]->(b) WHERE NOT a:Product OR NOT b:Product OR a.product_id IS NULL OR b.product_id IS NULL RETURN r')


def test_compatibility_rules_and_negative_fixtures_against_database():
    # The fixture validator covers all positive/negative predicates; verify graph/catalog
    # equality above before running it, so these are the same technical specifications.
    subprocess.run([sys.executable, str(db.DATA/'scripts/validate_dataset.py')], check=True, cwd=ROOT)


def test_quarterly_financial_reference(connection):
    actual = connection.execute('''SELECT extract(year FROM p.created_at)::int AS year,
        extract(quarter FROM p.created_at)::int AS quarter,
        sum(p.amount_cents) AS gross_sales_cents,
        coalesce(sum(p.amount_cents) FILTER (WHERE p.status='REFUNDED'),0) AS refund_cents,
        sum(p.amount_cents)-coalesce(sum(p.amount_cents) FILTER (WHERE p.status='REFUNDED'),0) AS net_sales_cents,
        count(*) AS paid_orders,count(*) FILTER (WHERE p.status='REFUNDED') AS refunded_orders,
        count(DISTINCT o.customer_id) AS distinct_buyers
        FROM payments.payments p JOIN orders.orders o USING(order_id)
        WHERE p.status IN ('SUCCEEDED','REFUNDED') AND p.payment_id=ANY(%s) GROUP BY 1,2 ORDER BY 1,2''',
        ([p['payment_id'] for p in db.sql_rows('payments')],)).fetchall()
    expected = [{key:int(value) for key,value in row.items()}
                for row in db.read_csv('lakehouse/quarterly_expected.csv')]
    assert actual == expected


def fingerprint():
    result = {}
    with db.pg() as connection:
        tables = connection.execute("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('auth','orders','inventory','payments','monitoring') AND table_type='BASE TABLE'").fetchall()
        for row in tables:
            name = row['table_schema']+'.'+row['table_name']
            if name == 'monitoring.worker_status':
                continue  # Live worker heartbeats are not seed-owned business state.
            values = [db.canonical(value) for value in connection.execute('SELECT * FROM '+name).fetchall()]
            if name.endswith('.outbox_events'):
                runtime = {'published_at','delivery_attempts','next_attempt_at','claim_owner','claim_until','last_error','kafka_partition','kafka_offset'}
                values = [{k:v for k,v in value.items() if k not in runtime} for value in values]
            result[name] = sorted(values, key=lambda value:json.dumps(value,sort_keys=True))
    with db.mongo() as client:
        result['mongo'] = [db.canonical(value) for value in client.market_catalog.products.find({}, {'_id':0}).sort('product_id')]
    result['graph_nodes'] = db.query('MATCH (p:Product) RETURN properties(p) AS props ORDER BY p.product_id')
    result['graph_edges'] = db.query('MATCH (a:Product)-[r:COMPATIBLE]->(b:Product) RETURN a.product_id AS a,b.product_id AS b,properties(r) AS props ORDER BY a.product_id,b.product_id,r.rule,r.relation_type')
    return hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()


def test_repeated_import_preserves_all_stored_rows():
    before = fingerprint()
    for _ in range(2):
        subprocess.run([sys.executable,str(db.DATA/'seeds/phase2.py'),'all'],check=True,cwd=ROOT)
        assert fingerprint() == before
