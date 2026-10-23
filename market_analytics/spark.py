from pathlib import Path

from delta.tables import DeltaTable
from pyspark.sql import SparkSession

from market_analytics.config import bucket, env


def session():
    c = env()
    builder = SparkSession.builder.appName('MarketHardwareAnalytics').master('local[2]')
    settings = {
        'spark.jars': ','.join(str(p) for p in Path('/app/jars').glob('*.jar')),
        'spark.sql.extensions': 'io.delta.sql.DeltaSparkSessionExtension',
        'spark.sql.catalog.spark_catalog': 'org.apache.spark.sql.delta.catalog.DeltaCatalog',
        'spark.sql.shuffle.partitions': '2', 'spark.default.parallelism': '2',
        'spark.sql.session.timeZone': 'UTC', 'spark.ui.enabled': 'false',
        'spark.driver.memory': '1g', 'spark.sql.adaptive.enabled': 'false',
        'spark.databricks.delta.snapshotPartitions': '2',
        'spark.hadoop.fs.s3a.endpoint': c.get('ANALYTICS_S3_ENDPOINT', 'http://minio:9000'),
        'spark.hadoop.fs.s3a.access.key': c['MINIO_ROOT_USER'],
        'spark.hadoop.fs.s3a.secret.key': c['MINIO_ROOT_PASSWORD'],
        'spark.hadoop.fs.s3a.aws.credentials.provider': 'org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider',
        'spark.hadoop.fs.s3a.path.style.access': 'true',
        'spark.hadoop.fs.s3a.connection.ssl.enabled': 'false',
        'spark.hadoop.fs.s3a.connection.maximum': '20',
        'spark.hadoop.fs.s3a.attempts.maximum': '3',
        'spark.hadoop.fs.s3a.retry.limit': '2',
        'spark.hadoop.fs.s3a.connection.establish.timeout': '3000',
        'spark.hadoop.fs.s3a.connection.timeout': '10000',
        'spark.hadoop.fs.s3a.change.detection.mode': 'none',
        'spark.hadoop.fs.s3a.multiobjectdelete.enable': 'false',
        'spark.delta.logStore.s3a.impl': 'io.delta.storage.S3SingleDriverLogStore',
        'spark.redaction.regex': '(?i)secret|password|token|access.key',
    }
    for key, value in settings.items():
        builder = builder.config(key, value)
    spark = builder.getOrCreate()
    spark.sparkContext.setLogLevel('WARN')
    return spark


def path(name):
    return f's3a://{bucket()}/{name}'


def merge(spark, frame, name, keys):
    target = path(name)
    source = frame.dropDuplicates(keys)
    if DeltaTable.isDeltaTable(spark, target):
        condition = ' AND '.join(f't.`{k}`=s.`{k}`' for k in keys)
        DeltaTable.forPath(spark, target).alias('t').merge(source.alias('s'), condition).whenNotMatchedInsertAll().execute()
    else:
        source.write.format('delta').mode('errorifexists').save(target)
