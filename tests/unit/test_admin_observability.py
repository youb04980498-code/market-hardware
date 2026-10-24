"""Focused coverage for the read-only monitoring UI additions."""
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from market_analytics.operations import register, trace_summary


def test_trace_summary_excludes_sensitive_attributes():
    trace = {'traceID': 'a' * 32, 'processes': {'p': {'serviceName': 'orders'}}, 'spans': [
        {'processID': 'p', 'operationName': 'POST /api/orders', 'duration': 1500, 'startTime': 123,
         'tags': [{'key': 'authorization', 'value': 'private'}, {'key': 'error', 'value': True}],
         'logs': [{'token': 'private'}]}]}
    result = trace_summary(trace, 'orders')
    assert result == {'trace_id': 'a' * 32, 'service': 'orders', 'operation': 'POST /api/orders',
        'duration_ms': 1.5, 'started_at_us': 123, 'error': True}
    assert 'private' not in str(result)


def test_new_monitoring_routes_retain_staff_dependency_and_validate_service():
    def staff(authorization: str | None = Header(None)):
        raise HTTPException(status_code=401 if authorization is None else 403)
    app = FastAPI()
    register(app, staff)
    with TestClient(app) as client:
        for path in ('/api/analytics/observability/history', '/api/analytics/observability/traces'):
            assert client.get(path).status_code == 401
            assert client.get(path, headers={'Authorization': 'Bearer customer'}).status_code == 403
    paths = app.openapi()['paths']
    assert not [p for p in paths['/api/analytics/observability/history']['get'].get('parameters', []) if p['in'] == 'query']
    param = next(p for p in paths['/api/analytics/observability/traces']['get']['parameters'] if p['name'] == 'service')
    assert 'orders' in param['schema']['pattern'] and 'http' not in param['schema']['pattern']
