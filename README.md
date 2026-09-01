# AquaCheck LIMS

**Laboratory Information Management System for Aquacheck Laboratories Ltd.**
ISO/IEC 17025:2017 compliant internal LIMS.

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Backend   | FastAPI (Python 3.11)             |
| Frontend  | Next.js 14 (TypeScript, Tailwind) |
| Database  | PostgreSQL 15                     |
| DB Admin  | pgAdmin 4                         |
| Container | Docker Compose                    |

---

## Quick Start - With Docker

### 1. Copy environment file
```bash
cp .env.example .env
```
Edit `.env` if you want custom passwords or secrets.

### 2. Start all services (If you're using docker)
```bash
docker compose up --build -d
```

### 3. Access the application
| Service   | URL                             | Credentials                              |
|-----------|---------------------------------|------------------------------------------|
| LIMS App  | http://localhost:3000           | admin@aquacheck.com / Admin@123          |
| API Docs  | http://localhost:8000/docs      | (Swagger UI)                             |
| pgAdmin   | http://localhost:5050           | admin@aquacheck.com / admin123           |

The default admin user is created automatically on first startup.


## Modules

| Module            | Description                                              | ISO 17025 Clause |
|-------------------|----------------------------------------------------------|------------------|
| Contracts         | Contract review and approval workflow                    | 7.1              |
| Samples           | Sample registration, chain of custody, QR barcodes      | 7.4              |
| Methods           | Test method management with version control              | 7.2              |
| Test Results      | Result entry, uncertainty calculation, validation        | 7.6, 7.7         |
| Equipment         | Equipment register, calibration tracking                 | 6.4              |
| Reports           | Report generation, issuance, PDF export                  | 7.8              |
| Complaints        | Customer complaint handling workflow                     | 7.9              |
| Non-Conformities  | NC identification, work suspension, corrective action    | 8.7              |
| Quality Dashboard | QA overview, audit log, alerts                           | 8.2              |
| Admin             | User management, role assignment                         | 6.2              |

---


## User Roles

| Role            | Access Level                                        |
|-----------------|-----------------------------------------------------|
| admin           | Full access including user management               |
| manager         | Contract review/approval, full operational access   |
| quality_manager | Method validation, test result validation, QA       |
| technician      | Sample registration, test result entry              |
| auditor         | Read-only access to audit logs and quality data     |
| customer        | Limited read access                                 |

---

## Quick Start - Without Docker

## NB: This is a Python 3.12 System

### Run backend locally (without Docker)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Set DATABASE_URL in .env to point to local postgres
uvicorn app.main:app --reload --port 8000
```


### Run frontend locally (without Docker)
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

### Database migrations (Alembic)
```bash
cd backend
alembic revision --autogenerate -m "your migration message"
alembic upgrade head
```

---

## Environment Variables

| Variable                    | Description                           | Default                                          |
|-----------------------------|---------------------------------------|--------------------------------------------------|
| DATABASE_URL                | PostgreSQL connection string          | postgresql://lims_user:lims_pass@db:5432/lims_db |
| SECRET_KEY                  | JWT signing secret                    | (change in production)                           |
| ALGORITHM                   | JWT algorithm                         | HS256                                            |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token lifetime (minutes)              | 480 (8 hours)                                    |
| POSTGRES_USER               | DB username                           | lims_user                                        |
| POSTGRES_PASSWORD           | DB password                           | lims_pass                                        |
| POSTGRES_DB                 | DB name                               | lims_db                                          |
| PGADMIN_EMAIL               | pgAdmin login email                   | admin@aquacheck.com                              |
| PGADMIN_PASSWORD            | pgAdmin login password                | admin123                                         |
| NEXT_PUBLIC_API_URL         | Backend URL (frontend env var)        | http://localhost:8000                            |

---


## DB Backups
### Create Backup
./scripts/backup.sh
Saves: backups/manual_lims_db_20260429_143000.sql.gz

### Restore backup
./scripts/restore.sh backups/manual_lims_db_20260429_143000.sql.gz

## To deploy
Push or PR to main
SSH into prod server and pull latest code
```bash
cd /path/to/aquacheck-lims
git pull origin main
docker compose down
docker compose up --build -d
```



docker image prune -f

## Production Checklist

- [ ] Change `SECRET_KEY` to a strong random value
- [ ] Change all default passwords
- [ ] Set `NODE_ENV=production` and use `next build`
- [ ] Configure HTTPS (reverse proxy with nginx/Caddy)
- [ ] Set up database backups
- [ ] Configure proper CORS origins
- [ ] Enable database SSL
