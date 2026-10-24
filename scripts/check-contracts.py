"""Compare reproducible public OpenAPI exports without running infrastructure."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main(write=False):
    from market_analytics import api
    from market_catalog import api as catalog
    from market_commerce import auth, inventory, orders, payments
    for name, module in [('auth', auth), ('inventory', inventory), ('orders', orders), ('payments', payments), ('analytics', api), ('catalog-operations', catalog)]:
        path = ROOT / 'data/contracts/openapi' / (name + '.v1.json')
        generated = module.app.openapi()
        if write:
            path.write_text(json.dumps(generated, indent=2) + '\n', encoding='utf-8')
        elif generated != json.loads(path.read_text(encoding='utf-8')):
            raise RuntimeError('OpenAPI drift: ' + name)
    print('Public OpenAPI exports: PASS')


if __name__ == '__main__':
    main('--write' in sys.argv)
