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

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
