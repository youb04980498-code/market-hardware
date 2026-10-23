FROM eclipse-temurin:17-jre-jammy@sha256:b3054a20e1a851574cdb1692dd0db5310c647e62214a2a7abecbec1b9e3ae8f1 AS java
FROM python:3.12.13-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36
COPY --from=java /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH=/opt/java/openjdk/bin:$PATH PYTHONUNBUFFERED=1 SPARK_LOCAL_IP=127.0.0.1 PYSPARK_PYTHON=python
WORKDIR /app
COPY services/analytics/requirements.txt /app/requirements.txt
COPY services/analytics/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r /app/requirements.txt -c /app/requirements.lock
COPY pipelines/lakehouse/download_jars.py pipelines/lakehouse/jars.lock.json /app/jars-setup/
RUN python /app/jars-setup/download_jars.py /app/jars /app/jars-setup/jars.lock.json && java -version
COPY market_analytics /app/market_analytics
COPY market_commerce /app/market_commerce
COPY data/contracts/events /app/data/contracts/events
RUN useradd --uid 10003 --create-home analytics
USER analytics
CMD ["python", "-m", "market_analytics.worker"]
