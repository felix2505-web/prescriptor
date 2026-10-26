import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .config import get_settings
from .db import Base, get_engine, session_factory
from .models import User, UserStatus
from .routers import admin, auth, fields, flights, prescriptions
from .security import hash_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("prescriptor")


def bootstrap() -> None:
    """Crea tablas, carpeta de datos y el administrador inicial."""
    s = get_settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    if s.database_url.startswith("sqlite:///"):
        Path(s.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(get_engine())
    if not s.admin_password:
        log.warning("ADMIN_PASSWORD no está definido: no se creó el administrador inicial")
        return
    db = session_factory()()
    try:
        if db.scalar(select(User).where(User.username == s.admin_username)) is None:
            db.add(User(
                username=s.admin_username, email=s.admin_email.lower(), full_name="Administrador",
                password_hash=hash_password(s.admin_password), status=UserStatus.ACTIVO, is_admin=True,
            ))
            db.commit()
            log.info("Administrador «%s» creado", s.admin_username)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    key = get_settings().secret_key
    if key == "cambia-esta-clave-en-produccion" or len(key) < 32:
        log.warning("SECRET_KEY débil o por defecto. Genera una con: openssl rand -hex 32")
    bootstrap()
    yield


app = FastAPI(
    title=get_settings().app_name,
    version="0.1.0",
    description="Backend del Prescriptor NDVI: cuentas, NDVI, zonas de manejo y prescripciones para drones Agras.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, admin.router, fields.router, flights.router, prescriptions.router):
    app.include_router(r)


@app.get("/salud", tags=["Sistema"])
def health():
    return {"ok": True}
