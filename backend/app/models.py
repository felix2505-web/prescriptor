from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserStatus(StrEnum):
    PENDIENTE = "pendiente"      # solicitó cuenta, espera aprobación
    APROBADO = "aprobado"        # admin aprobó, falta activar con el código
    ACTIVO = "activo"            # puede ingresar
    RECHAZADO = "rechazado"
    SUSPENDIDO = "suspendido"


class JobStatus(StrEnum):
    PENDIENTE = "pendiente"
    PROCESANDO = "procesando"
    LISTO = "listo"
    ERROR = "error"


class User(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(20), default=UserStatus.PENDIENTE)
    is_admin: Mapped[bool] = mapped_column(default=False)
    activation_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    activation_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    fields: Mapped[list["Field"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Field(Base):
    """Lote o potrero."""

    __tablename__ = "lotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    crop: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User] = relationship(back_populates="fields")
    flights: Mapped[list["Flight"]] = relationship(back_populates="field", cascade="all, delete-orphan")


class Flight(Base):
    """Un vuelo o imagen procesada de un lote."""

    __tablename__ = "vuelos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("lotes.id", ondelete="CASCADE"), index=True)
    flight_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # AAAA-MM-DD
    source_mode: Mapped[str] = mapped_column(String(20))  # "multibanda" o "ndvi"
    red_band: Mapped[int | None] = mapped_column(Integer, nullable=True)
    nir_band: Mapped[int | None] = mapped_column(Integer, nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default=JobStatus.PENDIENTE)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    field: Mapped[Field] = relationship(back_populates="flights")
    prescriptions: Mapped[list["Prescription"]] = relationship(
        back_populates="flight", cascade="all, delete-orphan"
    )


class Prescription(Base):
    """Mapa de dosis variable generado a partir de un vuelo."""

    __tablename__ = "prescripciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    flight_id: Mapped[int] = mapped_column(ForeignKey("vuelos.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    product: Mapped[str | None] = mapped_column(String(160), nullable=True)
    unit: Mapped[str] = mapped_column(String(20), default="L/ha")
    num_zones: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20))  # "cuantiles" o "intervalos"
    doses: Mapped[list] = mapped_column(JSON)  # dosis por zona, de NDVI bajo a alto
    min_area_m2: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(20), default=JobStatus.PENDIENTE)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    flight: Mapped[Flight] = relationship(back_populates="prescriptions")
