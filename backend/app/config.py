import json
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Default origins per environment — used when CORS_ORIGINS is not explicitly set.
# Keep this short and predictable; deployment-specific origins go in CORS_ORIGINS
# (wrangler.jsonc `vars` for prod, optional override in local `.env`).
DEFAULT_CORS_ORIGINS = {
    "development": ["http://localhost:3000", "http://localhost:5173"],
    "production": ["https://zuoyebang-app.pages.dev"],
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")

    # Stored as a raw string so pydantic-settings doesn't try to JSON-decode it
    # (the list[str] heuristic silently falls back to default on parse failure,
    # which masked CORS misconfig in prod). Parsed via the cors_origins property.
    # Empty → fall back to DEFAULT_CORS_ORIGINS[environment].
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")

    environment: str = Field(default="development", alias="ENVIRONMENT")

    @property
    def cors_origins(self) -> list[str]:
        raw = self.cors_origins_raw.strip()
        if not raw:
            return DEFAULT_CORS_ORIGINS.get(self.environment, DEFAULT_CORS_ORIGINS["development"])

        # Accept JSON-array form (["a","b"]) or comma-separated (a,b)
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(o).strip() for o in parsed if str(o).strip()]
            except json.JSONDecodeError:
                pass  # fall through to comma-split

        return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
