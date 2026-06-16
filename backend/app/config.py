from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Fly Manager"
    database_url: str = "sqlite:///./flymanager.db"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    storage_dir: Path = Path("storage")
    anthropic_api_key: str = ""


settings = Settings()
