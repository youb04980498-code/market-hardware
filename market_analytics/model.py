"""Typed snapshot schemas and Spark SQL metric definitions."""
from datetime import UTC, datetime

SCHEMAS = {
    'orders': 'order_id long,customer_key string,status string,total_cents long,currency string,created_at string,updated_at string',
    'order_lines': 'order_item_id long,order_id long,product_id long,quantity long,unit_price_cents long,product_name string,warehouse_id long,publication_version long',
    'customers': 'customer_key string,created_at string',
    'payments': 'payment_id long,order_id long,amount_cents long,status string,currency string,created_at string',
    'refunds': 'refund_id long,payment_id long,amount_cents long,status string,created_at string',
    'inventory': 'product_id long,warehouse_id long,quantity long,reserved_quantity long,updated_at string',
    'warehouses': 'warehouse_id long,name string,city string,capacity_units long',
    'classification': 'productId string,name string,category string,publicationVersion long',
}
KEYS = {'orders': ['order_id'], 'order_lines': ['order_item_id'], 'customers': ['customer_key'],
    'payments': ['payment_id'], 'refunds': ['refund_id'], 'inventory': ['product_id', 'warehouse_id'],
    'warehouses': ['warehouse_id'], 'classification': ['productId']}


def quarter_bounds(year, quarter):
    if not 2000 <= year <= 2100 or quarter not in (1, 2, 3, 4):
        raise ValueError('INVALID_QUARTER')
    month = 1 + (quarter - 1) * 3
    return datetime(year, month, 1, tzinfo=UTC), datetime(year + (quarter == 4), 1 if quarter == 4 else month + 3, 1, tzinfo=UTC)


def source_totals(data):
    payments = data['payments']
    refunds = {}
    for row in data['refunds']:
        if row['status'] == 'SUCCEEDED':
            refunds[row['payment_id']] = refunds.get(row['payment_id'], 0) + row['amount_cents']
    captured = [p for p in payments if p['status'] in ('SUCCEEDED', 'REFUNDED')]
    gross = sum(p['amount_cents'] for p in captured)
    returned = sum(refunds.get(p['payment_id'], p['amount_cents'] if p['status'] == 'REFUNDED' else 0) for p in captured)
    return {'order_count': len(data['orders']),
        'paid_order_count': sum(o['status'] in ('PAID', 'SHIPPED', 'DELIVERED') for o in data['orders']),
        'gross_cents': gross, 'refunded_cents': returned, 'net_cents': gross - returned,
        'line_quantity': sum(i['quantity'] for i in data['order_lines']),
        'sold_quantity': sum(i['quantity'] for i in data['order_lines'] if i['order_id'] in {p['order_id'] for p in captured})}


def build_gold(spark):
    # All joins are analytical joins over already exported Silver Delta data.
    spark.sql('''SELECT p.*, CASE WHEN p.status IN ('SUCCEEDED','REFUNDED') THEN p.amount_cents ELSE 0 END AS gross_cents,
        CASE WHEN p.status IN ('SUCCEEDED','REFUNDED') THEN
          coalesce(r.refunded,CASE WHEN p.status='REFUNDED' THEN p.amount_cents ELSE 0 END) ELSE 0 END AS refunded_cents
        FROM payments p LEFT JOIN (SELECT payment_id,sum(amount_cents) AS refunded FROM refunds
            WHERE status='SUCCEEDED' GROUP BY payment_id) r USING(payment_id)''').createOrReplaceTempView('payment_facts')
    spark.sql('''SELECT order_id,sum(gross_cents) AS gross_cents,sum(refunded_cents) AS refunded_cents,
        min(created_at) AS revenue_at FROM payment_facts WHERE status IN ('SUCCEEDED','REFUNDED') GROUP BY order_id''').createOrReplaceTempView('captured_orders')
    spark.sql('''SELECT i.*,o.customer_key,coalesce(i.product_name,c.name,concat('Product ',i.product_id)) AS name,
        coalesce(c.category,'UNKNOWN') AS category,p.revenue_at,
        i.quantity*i.unit_price_cents AS line_cents,o.total_cents,p.gross_cents,p.refunded_cents,
        row_number() OVER(PARTITION BY i.order_id ORDER BY i.product_id,i.order_item_id) AS line_rank
        FROM order_lines i JOIN orders o USING(order_id) JOIN captured_orders p USING(order_id)
        LEFT JOIN classification c ON cast(c.productId AS BIGINT)=i.product_id''').createOrReplaceTempView('sold_lines')
    spark.sql('''SELECT *,sum(line_cents) OVER(PARTITION BY order_id ORDER BY product_id,order_item_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_cents
        FROM sold_lines''').createOrReplaceTempView('allocated_lines')
    # Source validation guarantees a capture equals its frozen order total.
    # Differences of cumulative integer proportions conserve every cent and bound
    # each refund by its line value, unlike dumping all remainder cents on one line.
    spark.sql('''SELECT *,line_cents AS attributed_gross,CASE WHEN total_cents=0 THEN 0 ELSE
        cast((cast(refunded_cents AS DECIMAL(30,0))*cast(cumulative_cents AS DECIMAL(30,0)))
          DIV cast(total_cents AS DECIMAL(30,0)) AS BIGINT)
        -cast((cast(refunded_cents AS DECIMAL(30,0))*cast(cumulative_cents-line_cents AS DECIMAL(30,0)))
          DIV cast(total_cents AS DECIMAL(30,0)) AS BIGINT) END AS attributed_refund
        FROM allocated_lines''').createOrReplaceTempView('product_facts')
    queries = {
        'overview': '''SELECT (SELECT count(*) FROM orders) AS order_count,
          (SELECT count(*) FROM orders WHERE status IN ('PAID','SHIPPED','DELIVERED')) AS paid_order_count,
          (SELECT count(*) FROM captured_orders) AS captured_order_count,
          coalesce(sum(gross_cents),0) AS gross_cents,coalesce(sum(refunded_cents),0) AS refunded_cents,
          coalesce(sum(gross_cents-refunded_cents),0) AS net_cents,
          (SELECT coalesce(sum(quantity),0) FROM order_lines) AS line_quantity,
          (SELECT coalesce(sum(quantity),0) FROM product_facts) AS sold_quantity FROM payment_facts''',
        'revenue_daily': '''SELECT date_format(created_at,'yyyy-MM-dd') AS date,sum(gross_cents) AS gross_cents,
          sum(refunded_cents) AS refunded_cents,sum(gross_cents-refunded_cents) AS net_cents,
          count(*) AS payment_count FROM payment_facts WHERE status IN ('SUCCEEDED','REFUNDED') GROUP BY 1''',
        'revenue_monthly': '''SELECT date_format(created_at,'yyyy-MM') AS period,sum(gross_cents) AS gross_cents,
          sum(refunded_cents) AS refunded_cents,sum(gross_cents-refunded_cents) AS net_cents
          FROM payment_facts WHERE status IN ('SUCCEEDED','REFUNDED') GROUP BY 1''',
        'revenue_quarterly': '''SELECT concat(year(created_at),'-Q',quarter(created_at)) AS period,
          sum(gross_cents) AS gross_cents,sum(refunded_cents) AS refunded_cents,sum(gross_cents-refunded_cents) AS net_cents
          FROM payment_facts WHERE status IN ('SUCCEEDED','REFUNDED') GROUP BY 1''',
        'orders_daily': '''SELECT date_format(created_at,'yyyy-MM-dd') AS date,status,count(*) AS order_count,
          sum(total_cents) AS ordered_cents FROM orders GROUP BY 1,2''',
        'orders_monthly': '''SELECT date_format(created_at,'yyyy-MM') AS period,status,count(*) AS order_count FROM orders GROUP BY 1,2''',
        'orders_quarterly': '''SELECT concat(year(created_at),'-Q',quarter(created_at)) AS period,status,count(*) AS order_count FROM orders GROUP BY 1,2''',
        'product_performance': '''SELECT product_id,name,category,date_format(revenue_at,'yyyy-MM-dd') AS date,
          sum(quantity) AS units_sold,sum(attributed_gross) AS gross_cents,sum(attributed_refund) AS refunded_cents,
          sum(attributed_gross-attributed_refund) AS net_cents FROM product_facts GROUP BY 1,2,3,4''',
        'inventory_snapshot': '''SELECT i.product_id,i.warehouse_id,w.name AS warehouse,w.city,i.quantity,
          i.reserved_quantity,i.quantity-i.reserved_quantity AS available,i.updated_at AS source_updated_at,
          i.observed_at,coalesce(c.category,'UNKNOWN') AS category,coalesce(c.name,concat('Product ',i.product_id)) AS product_name
          FROM inventory i JOIN warehouses w USING(warehouse_id) LEFT JOIN classification c ON cast(c.productId AS BIGINT)=i.product_id''',
        'customers_daily': '''SELECT date_format(created_at,'yyyy-MM-dd') AS date,count(*) AS registered_customers FROM customers GROUP BY 1''',
        'customer_activity': '''SELECT o.customer_key,date_format(p.revenue_at,'yyyy-MM-dd') AS date,
          count(*) AS captured_orders FROM orders o JOIN captured_orders p USING(order_id) GROUP BY 1,2''',
        'order_status': 'SELECT status,count(*) AS order_count FROM orders GROUP BY status',
    }
    return {name: spark.sql(query) for name, query in queries.items()}
