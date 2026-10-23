FROM python:3.12.13-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36
WORKDIR /app
COPY services/catalog-graphql/requirements.txt /app/requirements.txt
COPY services/catalog-graphql/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r requirements.txt -c requirements.lock
COPY market_catalog /app/market_catalog
COPY data/mongodb/schema /app/data/mongodb/schema
COPY data/neo4j/compatibility_edges.csv /app/data/neo4j/compatibility_edges.csv
RUN useradd --uid 10001 --create-home market
USER market
CMD ["uvicorn", "market_catalog.api:app", "--host", "0.0.0.0", "--port", "8080"]
