"""Provision local runtime secrets and separate development accounts; never activate fixtures."""
import secrets
import sys
from pathlib import Path

from argon2 import PasswordHasher
from dotenv import dotenv_values, set_key
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from data.seeds.phase2 import migrate, pg


def main():
    path = ROOT / '.env'
    config = dotenv_values(path)
    defaults = {'DEV_ADMIN_EMAIL': 'phase4.admin@example.test', 'DEV_CUSTOMER_EMAIL': 'phase4.customer@example.test',
                'DEV_OTHER_EMAIL': 'phase4.other@example.test', 'COMMERCE_TESTING': '1', 'KAFKA_ENABLED': '0'}
    for key in ['JWT_SECRET', 'INTERNAL_JWT_SECRET', 'PG_OUTBOX_PASSWORD', 'DEV_ADMIN_PASSWORD', 'DEV_CUSTOMER_PASSWORD', 'DEV_OTHER_PASSWORD']:
        if not config.get(key):
            config[key] = secrets.token_urlsafe(48)
            set_key(str(path), key, config[key])
    for key, value in defaults.items():
        if not config.get(key):
            config[key] = value
            set_key(str(path), key, value)
    with pg(autocommit=True) as conn:
        migrate(conn)
        if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname='market_outbox_worker'").fetchone():
            conn.execute(sql.SQL('CREATE ROLE market_outbox_worker LOGIN PASSWORD {} IN ROLE market_outbox').format(sql.Literal(config['PG_OUTBOX_PASSWORD'])))
        conn.execute('GRANT CONNECT ON DATABASE market_db TO market_outbox_worker')
    hasher = PasswordHasher()
    with pg() as conn:
        for name, role in [('ADMIN', 'admin'), ('CUSTOMER', 'customer'), ('OTHER', 'customer')]:
            email = config['DEV_' + name + '_EMAIL']
            user = conn.execute('SELECT * FROM auth.users WHERE username=%s', (email,)).fetchone()
            if user is None:
                user = conn.execute('''INSERT INTO auth.users(username,email,first_name,last_name,password_hash,is_active)
                    VALUES(%s,%s,'Phase4',%s,%s,true) RETURNING *''',
                    (email, email, name.title(), hasher.hash(config['DEV_' + name + '_PASSWORD']))).fetchone()
                conn.execute('INSERT INTO auth.user_roles(user_id,role_id) SELECT %s,role_id FROM auth.roles WHERE name=%s', (user['user_id'], role))
            elif not user['is_active'] or not user['password_hash'].startswith('$argon2id$'):
                raise RuntimeError('Bootstrap account conflicts with an existing disabled account')
        if conn.execute("SELECT count(*) AS n FROM auth.users WHERE password_hash LIKE '!disabled%' AND is_active").fetchone()['n']:
            raise RuntimeError('A fixture account is unexpectedly active')
    print('Commerce migrations and restricted runtime login ready; separate development accounts use Argon2id. Secrets remain in .env.')


if __name__ == '__main__':
    main()
