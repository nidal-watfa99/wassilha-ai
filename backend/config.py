"""Application configuration loaded from environment variables.

Never commit real secrets. See .env.example for the variable names.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Security
    # In production ALWAYS set a long random secret (e.g. `openssl rand -hex 32`).
    jwt_secret: str = "dev-insecure-secret-change-me-0123456789"
    jwt_algorithm: str = "HS256"
    session_hours: int = 24 * 7

    # Database. sqlite default for development; use postgresql:// in production.
    database_url: str = "sqlite:///./data/wassilha.db"

    # CORS / origins. Comma separated. "*" allows all (development only).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cookie_secure: bool = False  # set True behind HTTPS

    # Uploads
    upload_dir: str = "./data/uploads"
    max_upload_mb: int = 25
    max_voice_mb: int = 15

    # AI provider (OpenAI-compatible). If not configured the assistant
    # returns an explicit "not configured" error - never a fake answer.
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""

    # Rate limiting (in-memory, per-process). Disable only in tests.
    rate_limit_enabled: bool = True

    # Preview mode: trust the hosting proxy's X-Visitor-Id header as a session
    # when no cookie is present (the sandboxed preview iframe blocks cookies).
    # Each visitor gets an auto-provisioned, isolated account. NEVER enable in
    # production: the header is only trustworthy behind the private preview proxy.
    preview_mode: bool = False
    stun_url: str = "stun:stun.l.google.com:19302"
    turn_url: str = ""
    turn_username: str = ""
    turn_credential: str = ""


settings = Settings()
