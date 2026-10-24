"""Apply additive migrations only. No seeding, password rotation or financial writes."""
import secrets
import sys
from pathlib import Path

from dotenv import dotenv_values, set_key
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from data.seeds.phase2 import migrate, mongo, pg


def main():
    config = dotenv_values(ROOT / '.env')
    if not config.get('PG_MONITOR_PASSWORD'):
        config['PG_MONITOR_PASSWORD'] = secrets.token_urlsafe(40)
        set_key(str(ROOT / '.env'), 'PG_MONITOR_PASSWORD', config['PG_MONITOR_PASSWORD'])
    if not config.get('PG_LOG_RETENTION_PASSWORD'):
        config['PG_LOG_RETENTION_PASSWORD'] = secrets.token_urlsafe(40)
        set_key(str(ROOT / '.env'), 'PG_LOG_RETENTION_PASSWORD', config['PG_LOG_RETENTION_PASSWORD'])
    if not config.get('MONGO_MONITOR_PASSWORD'):
        config['MONGO_MONITOR_PASSWORD'] = secrets.token_urlsafe(40)
        set_key(str(ROOT / '.env'), 'MONGO_MONITOR_PASSWORD', config['MONGO_MONITOR_PASSWORD'])
    from urllib.parse import quote
    uri = 'mongodb://market_monitor:' + quote(config['MONGO_MONITOR_PASSWORD'], safe='') + '@mongo:27017/admin'
    set_key(str(ROOT / '.env'), 'MONGODB_MONITOR_URI', uri)
    admin = mongo().admin
    if not admin.command('usersInfo', 'market_monitor')['users']:
        admin.command('createUser', 'market_monitor', pwd=config['MONGO_MONITOR_PASSWORD'], roles=[{'role': 'clusterMonitor', 'db': 'admin'}, {'role': 'read', 'db': 'local'}])
    with pg() as conn:
        migrate(conn)
        if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname='market_monitor'").fetchone():
            conn.execute(sql.SQL('CREATE ROLE market_monitor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD {}').format(
                sql.Literal(config['PG_MONITOR_PASSWORD'])))
        conn.execute('GRANT pg_monitor TO market_monitor')
        conn.execute('GRANT CONNECT ON DATABASE market_db TO market_monitor')
        if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname='market_log_retention'").fetchone():
            conn.execute(sql.SQL('CREATE ROLE market_log_retention LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD {}').format(sql.Literal(config['PG_LOG_RETENTION_PASSWORD'])))
        conn.execute('GRANT USAGE ON SCHEMA monitoring TO market_log_retention')
        conn.execute('GRANT SELECT ON monitoring.log_purge_runs TO market_log_retention')
        conn.execute('GRANT EXECUTE ON FUNCTION monitoring.purge_technical_logs() TO market_log_retention')
    print('Operations migrations and restricted monitoring login ready; existing records preserved.')


if __name__ == '__main__':
    main()
