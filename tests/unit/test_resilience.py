import pytest

from market_commerce.resilience import Circuit, DependencyUnavailable


def test_breaker_closed_open_half_open_recovery():
    now = [0]
    circuit = Circuit(failures=2, cooldown=10, clock=lambda: now[0])
    assert circuit.state == 'CLOSED'
    for _ in range(2):
        with pytest.raises(ValueError), circuit.call():
            raise ValueError('down')
    assert circuit.state == 'OPEN'
    with pytest.raises(DependencyUnavailable), circuit.call():
        pytest.fail('open circuit admitted a request')
    now[0] = 11
    assert circuit.state == 'HALF_OPEN'
    with circuit.call(), pytest.raises(DependencyUnavailable), circuit.call():
        pytest.fail('second half-open probe admitted')
    assert circuit.state == 'CLOSED'


def test_bulkhead_rejects_exhaustion_and_releases_slot():
    circuit = Circuit(concurrency=1)
    with circuit.call(), pytest.raises(DependencyUnavailable, match='BULKHEAD_FULL'), circuit.call():
        pytest.fail('bulkhead overflow admitted')
    with circuit.call():
        pass


def test_failed_half_open_probe_reopens():
    now = [0]
    circuit = Circuit(failures=1, cooldown=1, clock=lambda: now[0])
    with pytest.raises(ValueError), circuit.call():
        raise ValueError()
    now[0] = 2
    with pytest.raises(ValueError), circuit.call():
        raise ValueError()
    assert circuit.state == 'OPEN'


@pytest.mark.parametrize('raw', ['not-json', '{}', 'null', '{"event_type":"order.created","version":2}', '[]'])
def test_spike_detector_excludes_invalid_envelopes(raw):
    from market_analytics.alerts import valid_order_event
    assert valid_order_event(raw) is False


def test_catalog_metrics_do_not_import_commerce_database_dependencies(monkeypatch):
    import sys

    from market_commerce.telemetry import update_business_metrics
    monkeypatch.setitem(sys.modules, 'market_commerce.common', None)
    update_business_metrics('catalog')
