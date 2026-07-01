from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[1]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        extra="ignore",
    )

    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"  # but since auth-code flow, maybe not needed
    database_url: str = "sqlite:///./bams.db"
    secret_key: str = "your-secret-key"  # for JWT
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 300
    GROQ_API_KEY: str
    openai_api_key: str | None = None
    MODEL_NAME: str = "openai/gpt-oss-120b"
    PARSER_NAME: str = "bank_transaction_extractor"
    PARSER_VERSION: str = "1.0.0"

settings = Settings()
