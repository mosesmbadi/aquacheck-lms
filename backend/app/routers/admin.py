import gzip
import os
import shutil
import subprocess
import tempfile
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.config import settings
from app.deps import get_db, require_role
from app.models.user import User, UserRole
from app.services.audit import log_action

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/backup")
def create_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    """Dump the database with pg_dump and return it as a gzipped SQL file — the same
    format scripts/backup.sh produces, so scripts/restore.sh can restore it."""
    if not shutil.which("pg_dump"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="pg_dump is not installed on the server. Rebuild the backend image.",
        )
    url = make_url(settings.DATABASE_URL)
    # Credentials go through the environment, not the command line, so they don't
    # show up in the process list.
    env = {
        **os.environ,
        "PGHOST": url.host or "localhost",
        "PGPORT": str(url.port or 5432),
        "PGUSER": url.username or "",
        "PGPASSWORD": url.password or "",
        "PGDATABASE": url.database or "",
    }

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"aquacheck_{url.database}_{stamp}.sql.gz"
    fd, path = tempfile.mkstemp(suffix=".sql.gz")
    os.close(fd)
    try:
        with gzip.open(path, "wb", compresslevel=6) as out:
            proc = subprocess.run(
                ["pg_dump", "--schema=public", "--no-owner", "--no-privileges"],
                stdout=out,
                stderr=subprocess.PIPE,
                env=env,
                timeout=600,
            )
        if proc.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Backup failed: {proc.stderr.decode(errors='replace').strip()[:500]}",
            )
    except subprocess.TimeoutExpired:
        os.remove(path)
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Backup timed out.")
    except HTTPException:
        os.remove(path)
        raise

    log_action(db, current_user.id, "DATABASE_BACKUP", "database", url.database or "", new_value={"file": filename})
    return FileResponse(
        path,
        media_type="application/gzip",
        filename=filename,
        background=BackgroundTask(os.remove, path),
    )
