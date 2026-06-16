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

## Quick Start

### 1. Copy environment file
```bash
cp .env.example .env
```
Edit `.env` if you want custom passwords or secrets.

### 2. Start all services
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

---

## Services

### Backend (FastAPI)
- Port: **8000**
- API prefix: `/api/v1`
- Auto-creates all database tables on startup
- Seeds default admin: `admin@aquacheck.com` / `Admin@123`

### Frontend (Next.js)
- Port: **3000**
- Communicates with backend at `NEXT_PUBLIC_API_URL`

### Database (PostgreSQL 15)
- Internal port: 5432
- Volume: `postgres_data` (persistent)

### pgAdmin
- Port: **5050**
- Connect to DB server: host=`db`, port=`5432`

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

## Development

### Run backend locally (without Docker)
```bash
cd backend
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


docker compose pull secure_vision_backend secure_vision_frontend
docker compose up -d --no-deps secure_vision_backend secure_vision_frontend

docker image prune -f