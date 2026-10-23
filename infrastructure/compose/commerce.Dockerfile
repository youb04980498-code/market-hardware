FROM python:3.12.13-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36
WORKDIR /app
COPY services/commerce-requirements.txt /app/requirements.txt
COPY services/commerce-requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r requirements.txt -c requirements.lock
COPY market_commerce /app/market_commerce
RUN useradd --uid 10002 --create-home market
USER market
CMD ["uvicorn", "market_commerce.orders:app", "--host", "0.0.0.0", "--port", "8080"]
