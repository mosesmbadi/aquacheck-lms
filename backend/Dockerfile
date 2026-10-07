FROM python:3.11-slim

WORKDIR /app

# pg_dump for the admin "Download backup" feature. Its major version must be at least
# the database server's (postgres:15 in docker-compose).
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
