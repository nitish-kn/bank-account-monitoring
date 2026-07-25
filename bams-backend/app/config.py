from pydantic_settings import BaseSettings, SettingsConfigDict

from .core.constants import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    BACKEND_ROOT,
    DEFAULT_GOOGLE_REDIRECT_URI,
    DEFAULT_MODEL_NAME,
    DEFAULT_SECRET_KEY,
    JWT_ALGORITHM,
    PARSER_NAME,
    PARSER_VERSION,
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        extra="ignore",
    )

    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = DEFAULT_GOOGLE_REDIRECT_URI  # but since auth-code flow, maybe not needed
    database_url: str
    secret_key: str = DEFAULT_SECRET_KEY  # for JWT
    algorithm: str = JWT_ALGORITHM
    access_token_expire_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES
    GROQ_API_KEY: str
    openai_api_key: str | None = None
    MODEL_NAME: str = DEFAULT_MODEL_NAME
    PARSER_NAME: str = PARSER_NAME
    PARSER_VERSION: str = PARSER_VERSION

settings = Settings()
