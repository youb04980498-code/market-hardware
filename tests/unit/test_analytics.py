import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from market_analytics.events import parse_record
from market_analytics.model import quarter_bounds, source_totals
from market_analytics.serving import in_period, report_for_period


def envelope(**changes):
    return dict(event_id=str(uuid4()), event_type='order.created', version=1,
        aggregate_id='1', aggregate_type='order', occurred_at='2025-01-01T00:00:00Z',
        correlation_id=str(uuid4()), causation_id=None, idempotency_key=None, source='orders', payload={}, **changes)


@pytest.mark.parametrize('year,quarter,start,end', [
    (2024,1,'2024-01-01','2024-04-01'), (2024,2,'2024-04-01','2024-07-01'),
    (2025,3,'2025-07-01','2025-10-01'), (2025,4,'2025-10-01','2026-01-01')])
def test_quarter_boundaries(year, quarter, start, end):
    a,b = quarter_bounds(year, quarter)
    assert a.date().isoformat() == start and b.date().isoformat() == end
    assert a.tzinfo == UTC and b.tzinfo == UTC


@pytest.mark.parametrize('year,quarter', [(1999,1),(2101,1),(2025,0),(2025,5)])
def test_invalid_quarters(year, quarter):
    with pytest.raises(ValueError):
        quarter_bounds(year, quarter)


@pytest.mark.parametrize('version', [0,2,True,1.0,2147483648,'1',None])
def test_unknown_versions_quarantined(version):
    doc=envelope(); doc['version']=version
    result=parse_record('market.orders.v1',0,1,None,json.dumps(doc),datetime.now(UTC))
    assert result['parsing_status']=='INVALID' and result['error_code']=='UNKNOWN_EVENT_VERSION'


@pytest.mark.parametrize('raw', ['{broken','[]','null','42'])
def test_malformed_retains_transport_identity(raw):
    result=parse_record('market.orders.v1',2,19,'key',raw,datetime.now(UTC))
    assert result['parsing_status']=='INVALID'
    assert result['business_identity']=='market.orders.v1:2:19' and result['raw_payload']==raw


def test_duplicate_identity_independent_of_transport():
    raw=json.dumps(envelope())
    first=parse_record('market.orders.v1',0,1,None,raw,datetime.now(UTC))
    second=parse_record('market.orders.v1',0,2,None,raw,datetime.now(UTC))
    assert first['business_identity']==second['business_identity']
    assert first['transport_id']!=second['transport_id'] and first['late']


def test_topic_source_mismatch():
    result=parse_record('market.auth.v1',0,1,None,json.dumps(envelope()),datetime.now(UTC))
    assert result['error_code']=='SOURCE_TOPIC_MISMATCH'


def test_exclusive_date_boundary():
    assert in_period('2025-01-01','2025-01-01','2025-04-01')
    assert not in_period('2025-04-01','2025-01-01','2025-04-01')


def test_empty_period_is_zero_not_invented():
    tables={name:[] for name in ('revenue_daily','orders_daily','product_performance','customers_daily','customer_activity')}
    report=report_for_period({'tables':tables})
    assert report['gross_cents']==report['net_cents']==report['aov_cents']==0
    assert report['products']==[] and report['captured_order_count']==0


@pytest.mark.parametrize('status,refunds,gross,returned',[
    ('SUCCEEDED',[],100,0),('FAILED',[('SUCCEEDED',20)],0,0),
    ('PENDING',[],0,0),('REFUNDED',[],100,100),
    ('SUCCEEDED',[('SUCCEEDED',30),('FAILED',50),('PENDING',20)],100,30),
    ('REFUNDED',[('SUCCEEDED',100)],100,100),
])
def test_payment_metric_definitions(status,refunds,gross,returned):
    data={'orders':[{'order_id':1,'status':'PAID'}],
        'order_lines':[{'order_id':1,'quantity':3}],
        'payments':[{'payment_id':11,'order_id':1,'amount_cents':100,'status':status}],
        'refunds':[{'payment_id':11,'status':state,'amount_cents':amount} for state,amount in refunds]}
    result=source_totals(data)
    assert result['gross_cents']==gross and result['refunded_cents']==returned
    assert result['net_cents']==gross-returned
    assert result['sold_quantity']==(3 if status in ('SUCCEEDED','REFUNDED') else 0)
