"""Read-only query-plan evidence. Small-data sequential scans are reported honestly."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from data.seeds.phase2 import mongo, pg


def main():
    evidence = {}
    with pg() as conn:
        conn.execute('SET TRANSACTION READ ONLY')
        evidence['indexes'] = conn.execute("SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('orders','inventory','payments','auth','monitoring') ORDER BY 1,2,3").fetchall()
        for name, query in {
            'recent_orders': 'SELECT order_id,status,total_cents FROM orders.orders ORDER BY created_at DESC LIMIT 20',
            'available_stock': 'SELECT quantity-reserved_quantity FROM inventory.stock WHERE product_id=1001 AND warehouse_id=1',
            'unpublished_outbox': 'SELECT event_id FROM orders.outbox_events WHERE published_at IS NULL ORDER BY occurred_at LIMIT 20',
        }.items():
            evidence[name] = conn.execute('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query).fetchone()['QUERY PLAN']
    # Controlled before/after on a session-local copy: no live index is dropped.
    with pg() as conn:
        conn.execute('CREATE TEMP TABLE phase8_plan_orders ON COMMIT DROP AS SELECT created_at,status,total_cents FROM orders.orders')
        conn.execute('ANALYZE phase8_plan_orders')
        query = 'SELECT created_at,total_cents FROM phase8_plan_orders ORDER BY created_at DESC LIMIT 20'
        evidence['isolated_before_index'] = conn.execute('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query).fetchone()['QUERY PLAN']
        conn.execute('CREATE INDEX ON phase8_plan_orders(created_at DESC)')
        conn.execute('ANALYZE phase8_plan_orders')
        evidence['isolated_after_index'] = conn.execute('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query).fetchone()['QUERY PLAN']
    db = mongo().market_catalog
    evidence['mongo_indexes'] = list(db.products.list_indexes())
    evidence['mongo_query'] = db.command('explain', {'find': 'products', 'filter': {'active': True, 'category': 'GPU'}, 'limit': 10}, verbosity='executionStats')
    target = ROOT / 'docs' / 'evidence' / 'phase8-query-plans.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(evidence, default=str, indent=2), encoding='utf-8')
    print('Read-only PostgreSQL and MongoDB plan evidence saved:', target)


if __name__ == '__main__':
    main()
