"""Weekly technical-log purge. No business-table privileges are granted to this worker."""
import os
import time

import psycopg


def main():
    while True:
        with psycopg.connect(host='postgres', dbname='market_db', user='market_log_retention',
                            password=os.environ['PG_LOG_RETENTION_PASSWORD'], connect_timeout=5) as conn:
            conn.execute('SELECT pg_advisory_xact_lock(807007)')
            last = conn.execute("SELECT max(ended_at)>now()-interval '7 days' FROM monitoring.log_purge_runs WHERE status='COMPLETE'").fetchone()[0]
            if not last:
                count = conn.execute('SELECT monitoring.purge_technical_logs()').fetchone()[0]
                print(f'{{"service":"log-retention","status":"COMPLETE","deleted_count":{count}}}', flush=True)
        time.sleep(3600)


if __name__ == '__main__':
    main()
