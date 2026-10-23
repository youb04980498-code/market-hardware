"""Executed inside the pinned Spark image, using in-memory analytical fixtures only."""
from pyspark.sql import functions as F

from market_analytics.config import connect
from market_analytics.model import KEYS, SCHEMAS, build_gold
from market_analytics.spark import path, session


def main():
    spark = session()
    try:
        bronze=spark.read.format('delta').load(path('raw/kafka_events'))
        assert bronze.count()==bronze.select('transport_id').distinct().count()
        invalid=spark.read.format('delta').load(path('staging/invalid_events'))
        codes={r['error_code'] for r in invalid.select('error_code').distinct().collect()}
        assert {'UNKNOWN_EVENT_VERSION','JSON_PARSE_INVALID','CONFLICTING_EVENT_ID'}<=codes
        events=spark.read.format('delta').load(path('curated/events'))
        assert events.count()==events.select('business_identity').distinct().count()
        conflicts=invalid.where("error_code='CONFLICTING_EVENT_ID'").select('business_identity').distinct()
        assert conflicts.count()>0
        assert events.where("parsing_status='VALID'").join(conflicts,'business_identity').count()==0
        with connect() as conn:
            release=conn.execute('SELECT r.release_id,r.document FROM current_release c JOIN releases r USING(release_id)').fetchone()
        for name,keys in KEYS.items():
            frame=spark.read.format('delta').load(path('curated/'+name)).where(F.col('release_id')==release['release_id'])
            assert frame.count()==frame.select(*keys).distinct().count()
            if name=='orders':
                assert frame.count()==release['document']['tables']['overview'][0]['order_count']
        data = {name: [] for name in SCHEMAS}
        data['orders'] = [(1, 'pseudonym', 'PAID', 5, 'EUR', '2025-01-01', '2025-01-01')]
        data['order_lines'] = [(1,1,1,1,1,'A',1,1),(2,1,2,1,2,'B',1,1),(3,1,3,1,2,'C',1,1)]
        data['payments'] = [(1,1,5,'SUCCEEDED','EUR','2025-01-01')]
        data['customers'] = [('pseudonym','2025-01-01')]
        for refund in (0,1,2,3,4,5):
            data['refunds'] = [(1,1,refund,'SUCCEEDED','2025-02-01')] if refund else []
            for name,schema in SCHEMAS.items():
                (spark.createDataFrame(data[name],schema)
                    .withColumn('observed_at',F.lit('2025-01-01').cast('timestamp')).createOrReplaceTempView(name))
            gold = build_gold(spark)
            rows = gold['product_performance'].collect()
            assert sum(r['gross_cents'] for r in rows)==5
            assert sum(r['refunded_cents'] for r in rows)==refund
            assert sum(r['net_cents'] for r in rows)==5-refund
            assert all(0<=r['refunded_cents']<=r['gross_cents'] for r in rows)
        data['payments'] = [(1,1,5,'FAILED','EUR','2025-01-01')]
        for name,schema in SCHEMAS.items():
            (spark.createDataFrame(data[name],schema)
                .withColumn('observed_at',F.lit('2025-01-01').cast('timestamp')).createOrReplaceTempView(name))
        overview=build_gold(spark)['overview'].first()
        assert overview['gross_cents']==overview['refunded_cents']==overview['net_cents']==0
        print('PASS: actual Spark cumulative cent allocation and failed-payment exclusion')
    finally:
        spark.stop()


if __name__=='__main__':
    main()
