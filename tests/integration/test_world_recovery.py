"""Explicit broker outage check; always restores the retained broker. Run serially."""
import subprocess
import time

import httpx
import pytest
from dotenv import dotenv_values

from data.seeds.phase2 import ROOT


def wait_for(expected, timeout=60):
    until = time.monotonic()+timeout
    while time.monotonic()<until:
        data=httpx.get('http://127.0.0.1:8080/api/world/health',timeout=5,trust_env=False).json()['stream']
        if data['broker_connected'] is expected:
            return data
        time.sleep(1)
    pytest.fail('Broker state did not reconcile')


def docker(*args):
    result=subprocess.run(['docker','compose','--profile','streaming',*args],cwd=ROOT,capture_output=True,check=False)
    assert result.returncode == 0, 'Broker lifecycle command failed'


@pytest.mark.recovery
def test_broker_outage_keeps_http_authority_and_recovers():
    before=wait_for(True)
    config=dotenv_values(ROOT/'.env')
    with httpx.Client(base_url='http://127.0.0.1:8080',timeout=20,trust_env=False) as c:
        response=c.post('/api/auth/login',json={'username':config['DEV_ADMIN_EMAIL'],'password':config['DEV_ADMIN_PASSWORD']})
        assert response.status_code == 200
        headers={'Authorization':'Bearer '+response.json()['access_token']}
        try:
            docker('stop','kafka')
            wait_for(False)
            snapshot=c.get('/api/world/snapshot',headers=headers).json()
            assert snapshot['stream']['broker_connected'] is False
            assert snapshot['orders']['available'] is True
            assert snapshot['warehouses']['available'] is True
        finally:
            docker('up','-d','--no-deps','--wait','--wait-timeout','180','kafka')
        after=wait_for(True)
        assert after['instance'] == before['instance']
