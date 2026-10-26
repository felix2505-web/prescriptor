from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración leída desde variables de entorno o un archivo .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Prescriptor NDVI API"

    # Seguridad
    secret_key: str = "cambia-esta-clave-en-produccion"
    access_token_minutes: int = 60 * 12
    activation_code_hours: int = 72

    # Administrador inicial (se crea al arrancar si no existe)
    admin_username: str = "admin"
    admin_password: str = ""
    admin_email: str = "admin@example.com"

    # Base de datos: SQLite por defecto, PostgreSQL en producción
    database_url: str = "sqlite:///./data/prescriptor.db"

    # Archivos subidos y resultados
    data_dir: Path = Path("./data")
    max_upload_mb: int = 1024

    # CORS: orígenes del frontend separados por coma
    cors_origins: str = "https://prescriptordji.github.io,http://localhost:8080,http://127.0.0.1:8080"

    # Correo (opcional). Sin SMTP, el código de activación se devuelve al admin.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_tls: bool = True
    frontend_url: str = "https://prescriptordji.github.io/prescriptor/"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def smtp_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)


@lru_cache
def get_settings() -> Settings:
    return Settings()
