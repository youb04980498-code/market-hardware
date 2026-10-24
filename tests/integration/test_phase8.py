"""Live additive operations acceptance. All mutations use isolated test stock."""
import time
from uuid import uuid4

import httpx
import pytest

from market_analytics.alerts import reconcile
from market_analytics.config import connect
from market_analytics.source import capture
from tests.integration.test_phase4 import (
    checkout,
    docker,
    request,
    wait_order,
)
from tests.integration.test_phase4 import (
    commerce as commerce,  # noqa: PLC0414 -- pytest fixture re-export
)


def refresh_alerts():
    data, _, _ = capture()
    reconcile(data)


def test_alert_endpoint_security(commerce):
    for path in ('/api/analytics/alerts', '/api/analytics/observability', '/api/analytics/operations/today'):
        request('GET', path, expected=(401,))
        request('GET', path, commerce['tokens']['customer'], expected=(403,))
    request('GET', '/api/inventory/warehouses', commerce['tokens']['customer'], expected=(403,))


def test_stock_saturation_dedup_resolution_and_acknowledgement(commerce):
    admin = commerce['tokens']['admin']
    wid = request('POST', '/api/inventory/warehouses', admin,
        {'name': 'Phase8 capacity ' + uuid4().hex, 'city': 'Isolated test',
         'capacity_units': 10, 'classification': 'TEST'}, expected=(201,)).json()['warehouse_id']
    request('POST', '/api/inventory/adjustments', admin,
        {'warehouse_id': wid, 'product_id': 1001, 'delta': 10, 'reason': 'Phase8 isolated capacity test'}, key=uuid4())
    refresh_alerts()
    refresh_alerts()
    with connect() as conn:
        saturation = conn.execute("SELECT * FROM operational_alerts WHERE identity=%s", ('WAREHOUSE_SATURATION:' + str(wid),)).fetchone()
        assert saturation['status'] == 'ACTIVE'
        assert float(saturation['details']['utilization_percent']) == 100
        assert conn.execute('SELECT count(*) AS n FROM operational_alerts WHERE identity=%s', (saturation['identity'],)).fetchone()['n'] == 1
    request('POST', f"/api/analytics/alerts/{saturation['alert_id']}/acknowledge", admin)
    refresh_alerts()
    assert request('GET', f"/api/analytics/alerts/{saturation['alert_id']}", admin).json()['status'] == 'ACKNOWLEDGED'
    request('POST', '/api/inventory/adjustments', admin,
        {'warehouse_id': wid, 'product_id': 1001, 'delta': -6, 'reason': 'Phase8 low stock transition'}, key=uuid4())
    refresh_alerts()
    with connect() as conn:
        low = conn.execute('SELECT * FROM operational_alerts WHERE identity=%s', (f'LOW_STOCK:{wid}:1001',)).fetchone()
        assert low['status'] == 'ACTIVE'
        assert low['details']['available'] == 4
        assert conn.execute('SELECT status FROM operational_alerts WHERE alert_id=%s', (saturation['alert_id'],)).fetchone()['status'] == 'RESOLVED'
    request('POST', '/api/inventory/adjustments', admin,
        {'warehouse_id': wid, 'product_id': 1001, 'delta': 2, 'reason': 'Phase8 replenishment'}, key=uuid4())
    refresh_alerts()
    assert request('GET', f"/api/analytics/alerts/{low['alert_id']}", admin).json()['status'] == 'RESOLVED'
    default = request('GET', '/api/inventory/warehouses', admin).json()['items']
    included = request('GET', '/api/inventory/warehouses?include_test=true', admin).json()['items']
    assert wid not in {w['warehouse_id'] for w in default}
    assert next(w for w in included if w['warehouse_id'] == wid)['utilization_percent'] == 60


def test_payment_failure_alert_and_compensation(commerce):
    order, _, _ = checkout(commerce, simulation='decline')
    order = wait_order(commerce, order['order_id'], 'PAYMENT_FAILED')
    refresh_alerts()
    with connect() as conn:
        row = conn.execute("SELECT * FROM operational_alerts WHERE type='PAYMENT_FAILURE' AND details->>'order_id'=%s",
                           (str(order['order_id']),)).fetchone()
    assert row and row['severity'] == 'critical'
    assert 'card' not in str(row['details']).lower()


def test_monitoring_real_scrapes_dashboards_and_rules(commerce):
    targets = httpx.get('http://localhost:9090/api/v1/targets', timeout=10).json()['data']['activeTargets']
    assert targets and all(t['health'] == 'up' for t in targets)
    rules = httpx.get('http://localhost:9090/api/v1/rules', timeout=10).json()['data']['groups']
    assert len(rules[0]['rules']) >= 6
    for uid in ('platform-health', 'streaming-lakehouse', 'commerce-operations'):
        from dotenv import dotenv_values

        from market_commerce.common import ROOT
        config = dotenv_values(ROOT / '.env')
        response = httpx.get('http://localhost:3000/api/dashboards/uid/market-' + uid,
            auth=('admin', config['GRAFANA_ADMIN_PASSWORD']), timeout=10)
        assert response.status_code == 200
        assert response.json()['dashboard']['panels']
    result = request('GET', '/api/analytics/observability', commerce['tokens']['admin']).json()
    assert result['metrics']['availability']


def test_real_checkout_trace(commerce):
    order, _, _ = checkout(commerce)
    wait_order(commerce, order['order_id'], 'PAID')
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        traces = httpx.get('http://localhost:16686/api/traces', params={'service': 'orders', 'limit': 30}, timeout=10).json()['data']
        if any({'orders', 'inventory', 'payments'} <= {p['serviceName'] for p in t['processes'].values()} for t in traces):
            return
        time.sleep(1)
    pytest.fail('No real Orders/Inventory/Payments trace found')


@pytest.mark.recovery
def test_analytics_outage_does_not_block_checkout(commerce):
    with connect() as conn:
        retained = conn.execute("SELECT alert_id,status FROM operational_alerts WHERE type='PAYMENT_FAILURE' ORDER BY first_detected_at DESC LIMIT 1").fetchone()
    assert retained
    try:
        docker('stop', 'analytics', 'analytics-worker')
        assert httpx.get('http://localhost:8080/', timeout=10).status_code == 200
        assert httpx.get('http://localhost:8080/health/catalog', timeout=10).status_code == 200
        order, _, _ = checkout(commerce)
        assert wait_order(commerce, order['order_id'], 'PAID')['complete']
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            alerts = httpx.get('http://localhost:9093/api/v2/alerts', timeout=10).json()
            if any(a['labels'].get('alertname') == 'ServiceUnavailable' and a['labels'].get('instance') == 'analytics:8080' for a in alerts):
                break
            time.sleep(2)
        else:
            pytest.fail('Real Analytics degradation alert did not fire')
    finally:
        docker('start', 'analytics', 'analytics-worker')
    with connect() as conn:
        assert conn.execute('SELECT status FROM operational_alerts WHERE alert_id=%s', (retained['alert_id'],)).fetchone()['status'] == retained['status']
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        active = httpx.get('http://localhost:9090/api/v1/alerts', timeout=10).json()['data']['alerts']
        if not any(a['labels'].get('alertname') == 'ServiceUnavailable' and a['labels'].get('instance') == 'analytics:8080' for a in active):
            break
        time.sleep(2)
    else:
        pytest.fail('Analytics availability alert did not recover')


def test_checkpointed_order_spike_from_real_checkouts(commerce):
    # Allow the initial authoritative snapshot to finish before beginning the new checkpointed query.
    from market_analytics.config import bucket, s3
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        if s3().list_objects_v2(Bucket=bucket(), Prefix='checkpoints/order_spikes_v1/metadata', MaxKeys=1).get('KeyCount'):
            break
        time.sleep(2)
    for _ in range(15):
        order, _, _ = checkout(commerce)
        assert wait_order(commerce, order['order_id'], 'PAID')['complete']
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        with connect() as conn:
            alert = conn.execute("SELECT * FROM operational_alerts WHERE type='ORDER_SPIKE' AND first_detected_at>now()-interval '10 minutes' ORDER BY last_observed_at DESC LIMIT 1").fetchone()
        if alert and alert['details']['count'] >= 15:
            assert alert['source'] == 'spark_event_time'
            return
        time.sleep(2)
    pytest.fail('No event-time order spike from genuine checkouts')


def test_technical_log_purge_preserves_recent_logs_and_business_permissions():
    import psycopg

    from data.seeds.phase2 import pg, settings
    marker = 'phase8-' + uuid4().hex
    with pg() as conn:
        table_oids = [r['oid'] for r in conn.execute("SELECT 'orders.orders'::regclass::oid AS oid UNION ALL SELECT 'payments.payments'::regclass::oid").fetchall()]
        conn.execute("INSERT INTO monitoring.application_logs(service_name,level,message,created_at) VALUES('phase8','INFO',%s,now()-interval '8 days'),('phase8','INFO',%s,now())", (marker, marker))
    config = settings()
    with psycopg.connect(host='127.0.0.1', dbname='market_db', user='market_log_retention',
                         password=config['PG_LOG_RETENTION_PASSWORD']) as conn:
        assert conn.execute('SELECT monitoring.purge_technical_logs()').fetchone()[0] >= 1
        for oid in table_oids:
            assert not conn.execute("SELECT has_table_privilege(current_user,%s,'DELETE')", (oid,)).fetchone()[0]
    with pg() as conn:
        rows = conn.execute('SELECT created_at>now()-interval \'7 days\' AS recent FROM monitoring.application_logs WHERE message=%s', (marker,)).fetchall()
        assert len(rows) == 1 and rows[0]['recent']
        from datetime import UTC, datetime, timedelta

        from data.seeds.phase2 import read_csv, seed_sql, timestamp
        expired = [int(r['log_id']) for r in read_csv('monitoring/application_logs.csv')
            if timestamp(r['created_at']) < datetime.now(UTC) - timedelta(days=7)]
        seed_sql(conn)
        assert conn.execute('SELECT count(*) AS n FROM monitoring.application_logs WHERE log_id=ANY(%s)', (expired,)).fetchone()['n'] == 0


def test_isolated_restore_evidence():
    import json

    from market_commerce.common import ROOT
    reports = sorted((ROOT / '.local/backups').glob('*/report.json'))
    assert reports, 'Run scripts/backup-platform.py --restore-isolated first'
    report = json.loads(reports[-1].read_text(encoding='utf-8'))
    assert set(report['stores']) == {'postgres', 'mongodb', 'neo4j', 'minio'}
    assert all(row['restore'] == 'PASS' for row in report['stores'].values())


def test_operator_role_maps_to_staff_without_public_role_escalation():
    from data.seeds.phase2 import pg
    from tests.integration.test_phase4 import login
    email = 'phase8-staff-' + uuid4().hex + '@local.test'
    password = uuid4().hex
    account = request('POST', '/api/auth/register', body={'username': email, 'email': email,
        'password': password, 'first_name': 'Phase8', 'last_name': 'Staff'}, expected=(201,)).json()
    assert account['roles'] == ['customer']
    # Explicit administrative provisioning of an isolated test identity; no public role mutation API.
    with pg() as conn:
        conn.execute("INSERT INTO auth.user_roles(user_id,role_id) SELECT %s,role_id FROM auth.roles WHERE name='operator' ON CONFLICT DO NOTHING", (account['user_id'],))
    token = login(email, password)['access_token']
    assert 'staff' in request('GET', '/api/auth/me', token).json()['roles']
    request('GET', '/api/inventory/warehouses', token)
    request('GET', '/api/analytics/alerts', token)
