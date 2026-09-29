from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://lims_user:lims_pass@db:5432/lims_db"
    SECRET_KEY: str = "change-me-in-production-super-secret-key-123"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Admin seed credentials — must be set in .env; no hardcoded fallbacks
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str

    # Last sample number issued before the LIMS took over numbering (e.g. 165 for
    # QT/165/2026 in the paper register). The next sample is this + 1, unless the
    # LIMS already holds a higher number.
    SAMPLE_CODE_START_AFTER: int = 0

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
