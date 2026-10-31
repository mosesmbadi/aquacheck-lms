FROM python:3.11-slim

WORKDIR /app

# pg_dump for the admin "Download backup" feature. Its major version must be at least
# the database server's (postgres:15 in docker-compose).
# Carlito: metric-compatible Calibri for generated PDFs (see app/services/pdf_fonts.py).
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client fonts-crosextra-carlito \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# No --reload here: in production it keeps a file watcher scanning the mounted source
# (venv and uploads included). docker-compose-local.yml turns it back on for development.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
