import argparse
import json
import time
from datetime import UTC, datetime
from uuid import uuid4

from market_analytics.config import connect, env
from market_analytics.model import quarter_bounds


def submit(kind, year=None, quarter=None, timeout=600, fault=None):
    if kind == 'quarterly':
        quarter_bounds(year, quarter)
    identifier = uuid4()
    if fault and env().get('ANALYTICS_TESTING') != '1':
        raise ValueError('ANALYTICS_FAULT_CONTROLS_DISABLED')
    with connect() as conn:
        conn.execute('INSERT INTO jobs(job_id,kind,year,quarter,fault) VALUES(%s,%s,%s,%s,%s)', (identifier, kind, year, quarter, fault))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with connect() as conn:
            row = conn.execute('SELECT status,error_code,result FROM jobs WHERE job_id=%s', (identifier,)).fetchone()
        if row['status'] == 'COMPLETE':
            return row['result']
        if row['status'] == 'ERROR':
            raise RuntimeError('ANALYTICS_JOB_FAILED:' + row['error_code'])
        time.sleep(2)
    raise TimeoutError('ANALYTICS_JOB_STILL_QUEUED_OR_RUNNING:' + str(identifier))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['health', 'backfill', 'quarterly'])
    parser.add_argument('--year', type=int)
    parser.add_argument('--quarter', type=int)
    parser.add_argument('--timeout', type=int, default=600)
    parser.add_argument('--fault', choices=['before_pointer','crash_before_pointer'])
    args = parser.parse_args()
    if args.command == 'health':
        with connect() as conn:
            state = conn.execute('SELECT state,checked_at,last_success_at FROM pipeline_status WHERE singleton').fetchone()
        if not state or state['state'] not in ('RUNNING', 'REFRESHING') or not state['last_success_at'] or (datetime.now(UTC) - state['last_success_at']).total_seconds() > 600 or (datetime.now(UTC) - state['checked_at']).total_seconds() > 600:
            raise SystemExit(1)
    else:
        print(json.dumps(submit(args.command, args.year, args.quarter, args.timeout, args.fault), default=str))


if __name__ == '__main__':
    main()
