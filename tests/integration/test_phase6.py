"""Actual local databases, S3 objects, Kafka and gateway. No financial source rewrites."""
import json
import subprocess
import time
from datetime import UTC, datetime
from uuid import uuid4

import psycopg
import pytest
from confluent_kafka import Producer
from dotenv import dotenv_values

from market_analytics.cli import submit
from market_analytics.config import ROOT, bucket, connect, s3
from market_analytics.model import source_totals
from market_analytics.pipeline import publish
from market_analytics.serving import current
from market_analytics.source import capture
from tests.integration.test_phase4 import login, request


@pytest.fixture(scope='module')
def tokens():
    cfg=dotenv_values(ROOT / '.env')
    return {name.lower():login(cfg[f'DEV_{name}_EMAIL'],cfg[f'DEV_{name}_PASSWORD'])['access_token']
        for name in ('ADMIN','CUSTOMER')}


def compose(*args):
    result=subprocess.run(['docker','compose','--profile','analytics',*args],cwd=ROOT,capture_output=True,check=False)
    assert result.returncode==0, 'Docker operation failed: '+args[0]


def wait_pipeline(predicate, timeout=300):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        with connect() as c:
            row=c.execute('SELECT * FROM pipeline_status').fetchone()
        if row and predicate(row):
            return row
        time.sleep(2)
    pytest.fail('Pipeline did not reach required durable state')


def test_real_financial_and_entity_reconciliation():
    submit('backfill',timeout=900)
    data,_,_=capture()
    doc,_=current()
    expected=source_totals(data)
    actual=doc['tables']['overview'][0]
    assert all(actual[key]==value for key,value in expected.items())
    assert doc['reconciliation']['status']=='PASS'
    assert all(r['difference']==0 for r in doc['reconciliation']['checks'])
    assert sum(r['net_cents'] for r in doc['tables']['product_performance'])==expected['net_cents']


def test_private_minio_delta_and_checkpoint_objects():
    client=s3(); client.head_bucket(Bucket=bucket())
    for prefix in ('raw/kafka_events/_delta_log/','curated/orders/_delta_log/',
                   'consumption/overview/_delta_log/','checkpoints/kafka_ingestion_v1/commits/'):
        assert client.list_objects_v2(Bucket=bucket(),Prefix=prefix,MaxKeys=1).get('KeyCount',0)>0
    policy=client.get_bucket_acl(Bucket=bucket())
    assert not any('URI' in grant['Grantee'] for grant in policy['Grants'])


def test_repeatable_backfill_retains_release_identity():
    first=submit('backfill',timeout=900)
    second=submit('backfill',timeout=900)
    assert first['release_id']==second['release_id'] and second['unchanged']


@pytest.mark.parametrize('path', ['overview','revenue','orders','products/top','inventory','customers','quarters','pipeline/status'])
def test_authenticated_materialized_endpoints(tokens,path):
    result=request('GET','/api/analytics/'+path,tokens['admin']).json()
    assert result['metadata']['release_id'] and result['definitions']['revenue']
    assert 'data' in result and result['metadata']['currency']=='EUR'
    request('GET','/api/analytics/'+path,expected=(401,))
    request('GET','/api/analytics/'+path,tokens['customer'],expected=(403,))


@pytest.mark.parametrize('query', ['from=2026-02-01&to=2026-01-01','from=invalid','page=0','page_size=101','category=INVALID'])
def test_api_filter_validation(tokens,query):
    request('GET','/api/analytics/products/top?'+query,tokens['admin'],expected=(422,))


def test_empty_period_and_quarter_bounds(tokens):
    result=request('GET','/api/analytics/overview?from=2099-01-01&to=2099-02-01',tokens['admin']).json()['data']
    assert result['gross_cents']==result['order_count']==result['aov_cents']==0
    request('GET','/api/analytics/quarters/2025/5',tokens['admin'],expected=(422,))


def test_runtime_roles_are_read_only_and_source_columns_restricted():
    with connect('reader') as c:
        assert c.execute('SHOW default_transaction_read_only').fetchone()['default_transaction_read_only']=='on'
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute('SELECT password_hash FROM auth.users LIMIT 1')
    with connect('api') as c:
        assert c.execute('SHOW default_transaction_read_only').fetchone()['default_transaction_read_only']=='on'
        with pytest.raises(psycopg.errors.ReadOnlySqlTransaction):
            c.execute("UPDATE pipeline_status SET state='ERROR' WHERE false")
    with connect('reader') as c:
        c.execute('SET TRANSACTION READ WRITE')
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute('UPDATE inventory.stock SET quantity=quantity WHERE false')


def test_interrupted_projection_transaction_preserves_visible_version():
    doc,_=current()
    with pytest.raises(RuntimeError,match='INJECTED_PROJECTION_INTERRUPTION'):
        publish('test-interrupted-'+str(uuid4()),datetime.now(UTC),doc,fault='before_pointer')
    after,_=current()
    assert after['release_id']==doc['release_id']
    with connect() as c:
        assert c.execute("SELECT count(*) AS n FROM releases WHERE release_id LIKE 'test-interrupted-%'").fetchone()['n']==0


@pytest.mark.parametrize('year',[2025,2099])
def test_quarter_materialization_is_idempotent(tokens,year):
    first=submit('quarterly',year,1,timeout=900)
    second=submit('quarterly',year,1,timeout=900)
    assert first==second
    assert first['boundary_start']==f'{year}-01-01T00:00:00+00:00'
    assert first['boundary_end_exclusive']==f'{year}-04-01T00:00:00+00:00'
    if year==2099:
        assert first['gross_cents']==first['order_count']==first['net_cents']==0
    result=request('GET',f'/api/analytics/quarters/{year}/1',tokens['admin']).json()['data']
    assert result==first


@pytest.mark.recovery
def test_kafka_duplicates_quarantine_lateness_and_checkpoint_restart():
    before=wait_pipeline(lambda r:r['state']=='RUNNING')['metrics']
    identifier=str(uuid4())
    doc=dict(event_id=identifier,event_type='order.created',version=1,aggregate_id='phase6-audit-'+identifier,  # noqa: C408
        aggregate_type='order',occurred_at='2020-01-01T00:00:00Z',correlation_id=str(uuid4()),causation_id=None,idempotency_key=None,source='orders',payload={})
    producer=Producer({'bootstrap.servers':'127.0.0.1:9092'})
    for raw in (json.dumps(doc),json.dumps(doc),'{corrupt',json.dumps({**doc,'event_id':str(uuid4()),'version':2})):
        producer.produce('market.orders.v1',value=raw.encode())
    assert producer.flush(10)==0
    row=wait_pipeline(lambda r:r['metrics'].get('bronze_records',0)>=before['bronze_records']+4,timeout=600)
    assert row['metrics']['duplicate_records']>=before['duplicate_records']+1
    assert row['metrics']['invalid_records']>=before['invalid_records']+2
    assert row['metrics']['late_records']>=before['late_records']+2
    count=row['metrics']['bronze_records']
    compose('restart','analytics-worker')
    wait_pipeline(lambda r:r['state']=='RUNNING' and r['metrics'].get('bronze_records',0)>=count,timeout=600)
    time.sleep(20)
    with connect() as c:
        after=c.execute('SELECT metrics FROM pipeline_status').fetchone()['metrics']
    assert after['bronze_records']==count
    producer.produce('market.orders.v1',value=json.dumps({**doc,'event_id':str(uuid4())}).encode())
    assert producer.flush(10)==0
    resumed=wait_pipeline(lambda r:r['metrics'].get('bronze_records',0)>=count+1,timeout=600)
    assert resumed['metrics']['bronze_records']==count+1


@pytest.mark.recovery
@pytest.mark.parametrize('service',['kafka','minio'])
def test_dependency_outage_preserves_serving_and_commerce(tokens,service):
    doc,_=current()
    try:
        compose('stop',service)
        result=request('GET','/api/analytics/overview',tokens['admin']).json()
        assert result['metadata']['release_id']==doc['release_id']
        for name in ('orders','inventory','payments','auth'):
            assert request('GET',f'/api/{name}/health').json()['status']=='ok'
        if service=='minio':
            wait_pipeline(lambda r:r['state']=='ERROR' or bool(r['error_code']),timeout=240)
            assert request('GET','/api/analytics/overview',tokens['admin']).json()['metadata']['stale']
    finally:
        compose('start',service)
        compose('restart','analytics-worker')
    wait_pipeline(lambda r:r['state']=='RUNNING',timeout=900)
    submit('backfill',timeout=900)


@pytest.mark.recovery
def test_actual_driver_crash_before_pointer_recovers_queued_job():
    before,_=current()
    # Fault is consumed durably before exit; restart requeues this same job.
    result=submit('backfill',timeout=900,fault='crash_before_pointer')
    after,_=current()
    assert result['release_id']==before['release_id']==after['release_id']
    assert after['reconciliation']['status']=='PASS'


@pytest.mark.recovery
def test_late_partial_and_full_refunds_correct_original_cohort(tokens):
    from tests.integration.test_phase4 import wait_order
    wid=request('POST','/api/inventory/warehouses',tokens['admin'],
        {'name':'Phase6 refund '+str(uuid4()),'city':'Analytics tests','capacity_units':10},expected=(201,)).json()['warehouse_id']
    request('POST','/api/inventory/adjustments',tokens['admin'],
        {'product_id':1001,'warehouse_id':wid,'delta':1,'reason':'Phase6 isolated refund verification'},key=uuid4())
    created=request('POST','/api/orders',tokens['customer'],
        {'items':[{'product_id':1001,'quantity':1}],'warehouse_id':wid},key=uuid4(),expected=(200,201,202)).json()
    order=wait_order({'tokens':tokens},created['order_id'],'PAID')
    pid=order['saga']['payment_id']; amount=order['total_cents']
    submit('backfill',timeout=900)
    before,_=current(); first=before['tables']['overview'][0]
    partial=amount//3
    request('POST',f'/api/payments/{pid}/refund',tokens['admin'],{'amount_cents':partial},key=uuid4())
    submit('backfill',timeout=900)
    after,_=current(); second=after['tables']['overview'][0]
    assert second['gross_cents']==first['gross_cents']
    assert second['refunded_cents']==first['refunded_cents']+partial
    assert second['net_cents']==first['net_cents']-partial
    year=datetime.now(UTC).year; quarter=(datetime.now(UTC).month-1)//3+1
    original=submit('quarterly',year,quarter,timeout=900)
    request('POST',f'/api/payments/{pid}/refund',tokens['admin'],{'amount_cents':amount-partial},key=uuid4())
    corrected=submit('quarterly',year,quarter,timeout=900)
    assert corrected['gross_cents']==original['gross_cents']
    assert corrected['refunded_cents']==original['refunded_cents']+amount-partial
    assert corrected['net_cents']==original['net_cents']-(amount-partial)
    assert corrected['release_id']!=original['release_id']


@pytest.mark.recovery
def test_analytics_api_restart_and_checkout_during_analytics_outage(tokens):
    from tests.integration.test_phase4 import wait_order
    wid=request('POST','/api/inventory/warehouses',tokens['admin'],
        {'name':'Phase6 outage '+str(uuid4()),'city':'Analytics tests','capacity_units':10},expected=(201,)).json()['warehouse_id']
    request('POST','/api/inventory/adjustments',tokens['admin'],
        {'product_id':1001,'warehouse_id':wid,'delta':1,'reason':'Phase6 outage verification'},key=uuid4())
    try:
        compose('stop','analytics','analytics-worker')
        created=request('POST','/api/orders',tokens['customer'],
            {'items':[{'product_id':1001,'quantity':1}],'warehouse_id':wid},key=uuid4(),expected=(200,201,202)).json()
        order=wait_order({'tokens':tokens},created['order_id'],'PAID')
        assert order['complete'] and order['saga']['payment_id']
    finally:
        compose('up','-d','--no-deps','--wait','--wait-timeout','900','analytics-worker','analytics')
    submit('backfill',timeout=900)
    data,_,_=capture(); doc,_=current()
    assert any(o['order_id']==order['order_id'] for o in data['orders'])
    assert doc['tables']['overview'][0]['gross_cents']==source_totals(data)['gross_cents']
    request('GET','/api/analytics/overview',tokens['admin'])


@pytest.mark.recovery
def test_out_of_order_and_conflicting_ids_do_not_override_authoritative_money():
    submit('backfill',timeout=900)
    original,_=current()
    before=wait_pipeline(lambda r:r['state']=='RUNNING')['metrics']
    identifier=str(uuid4())
    doc={'event_id':identifier,'event_type':'payment.succeeded','version':1,'aggregate_id':'phase6-ordering-'+identifier,
        'aggregate_type':'payment','occurred_at':'2025-01-02T00:00:00Z','correlation_id':str(uuid4()),
        'causation_id':None,'idempotency_key':None,'source':'payments','payload':{'amount_cents':999999999}}
    producer=Producer({'bootstrap.servers':'127.0.0.1:9092'})
    producer.produce('market.payments.v1',value=json.dumps(doc).encode())
    assert producer.flush(10)==0
    wait_pipeline(lambda r:r['metrics'].get('bronze_records',0)>=before['bronze_records']+1,timeout=600)
    for item in ({**doc,'event_id':str(uuid4()),'event_type':'payment.failed','occurred_at':'2025-01-01T00:00:00Z'},
                 {**doc,'payload':{'amount_cents':1}}):
        producer.produce('market.payments.v1',value=json.dumps(item).encode())
    assert producer.flush(10)==0
    row=wait_pipeline(lambda r:r['metrics'].get('bronze_records',0)>=before['bronze_records']+3,timeout=600)
    assert row['metrics']['invalid_records']>=before['invalid_records']+2
    submit('backfill',timeout=900)
    after,_=current()
    assert after['tables']['overview']==original['tables']['overview']


@pytest.mark.recovery
def test_actual_spark_fractional_cent_allocation_and_failed_payment_exclusion():
    # A second temporary driver does no S3 writes; stop the normal writer to keep
    # memory bounded and make this independent of live source business data.
    source=(ROOT/'tests/integration/analytics_spark_assertions.py').read_text(encoding='utf-8')
    try:
        compose('stop','analytics-worker')
        compose('run','--rm','--no-deps','-T','--entrypoint','python',
            '-e','PYSPARK_SUBMIT_ARGS=--driver-memory 512m pyspark-shell','analytics-worker','-c',source)
    finally:
        compose('up','-d','--no-deps','--wait','--wait-timeout','900','analytics-worker')
