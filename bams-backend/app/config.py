from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"  # but since auth-code flow, maybe not needed
    database_url: str = "sqlite:///./bams.db"
    secret_key: str = "your-secret-key"  # for JWT
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 300

    class Config:
        env_file = ".env"

settings = Settings()