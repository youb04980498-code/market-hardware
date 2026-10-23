"""Local provisioning. Capture credentials directly into .env without displaying them."""
import json
import secrets
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values, set_key
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from market_catalog.pim import UnoPim


def main():
    path = ROOT / '.env'
    env = dotenv_values(path)
    if not env.get('UNOPIM_CLIENT_ID'):
        subprocess.run(['docker', 'compose', 'cp', 'infrastructure/unopim/bootstrap-market.php',
                        'unopim:/tmp/bootstrap-market.php'], check=True, cwd=ROOT, capture_output=True)
        result = subprocess.run(['docker', 'compose', 'exec', '-T', 'unopim', 'php',
                                 '/tmp/bootstrap-market.php'], check=False, cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('UnoPim integration provisioning failed: ' + result.stderr[:200])
        credentials = json.loads(result.stdout)
        for key, value in credentials.items():
            set_key(str(path), key, str(value))
        print('UnoPim integration provisioned; credentials saved directly in .env.')
    env = dotenv_values(path)
    with MongoClient('127.0.0.1', username=env['MONGO_ROOT_USER'], password=env['MONGO_ROOT_PASSWORD'],
                     authSource='admin') as client:
        for access, role in [('SYNC', 'readWrite'), ('READ', 'read')]:
            prefix = 'MONGO_CATALOG_' + access
            user = env.get(prefix + '_USER', 'market_catalog_' + access.lower())
            existing = client.market_catalog.command('usersInfo', user)['users']
            password = env.get(prefix + '_PASSWORD')
            if existing and not password:
                raise RuntimeError('Existing MongoDB login needs its original local credential')
            if not password:
                password = secrets.token_urlsafe(32)
                set_key(str(path), prefix + '_PASSWORD', password)
            set_key(str(path), prefix + '_USER', user)
            if not existing:
                client.market_catalog.command('createUser', user, pwd=password,
                    roles=[{'role': role, 'db': 'market_catalog'}])
    pim = UnoPim()
    try:
        pim.configure()
        pim.import_seed()
    finally:
        pim.close()
    print('UnoPim categories, families, attributes and seed products configured through REST.')


if __name__ == '__main__':
    main()
