from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Cuentas ----------

class AccountRequest(BaseModel):
    full_name: str = Field(min_length=3, max_length=160)
    email: EmailStr
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.\-]+$")
    password: str = Field(min_length=8, max_length=256)


class ActivateIn(BaseModel):
    code: str = Field(min_length=10, max_length=200)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserOut"


class UserOut(Out):
    id: int
    username: str
    email: str
    full_name: str
    status: str
    is_admin: bool
    created_at: datetime
    approved_at: datetime | None


class ApprovalOut(BaseModel):
    user: UserOut
    email_sent: bool
    activation_code: str | None = Field(
        default=None, description="Solo se devuelve si no hay SMTP configurado, para enviarlo a mano."
    )
    expires_at: datetime


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=256)


# ---------- Lotes ----------

class FieldIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    crop: str | None = Field(default=None, max_length=80)
    notes: str | None = None


class FieldOut(Out):
    id: int
    name: str
    crop: str | None
    notes: str | None
    created_at: datetime
    flights_count: int = 0


# ---------- Vuelos ----------

class FlightOut(Out):
    id: int
    field_id: int
    flight_date: str | None
    source_mode: str
    red_band: int | None
    nir_band: int | None
    original_filename: str
    status: str
    error: str | None
    stats: dict | None
    created_at: datetime


# ---------- Prescripciones ----------

class PrescriptionIn(BaseModel):
    name: str = Field(default="Prescripción", max_length=160)
    product: str | None = Field(default=None, max_length=160)
    unit: str = Field(default="L/ha", max_length=20)
    num_zones: int = Field(default=3, ge=2, le=7)
    method: Literal["cuantiles", "intervalos"] = "cuantiles"
    doses: list[float] = Field(
        description="Dosis por zona, ordenadas de NDVI bajo a NDVI alto. Debe tener num_zones valores."
    )
    min_area_m2: float = Field(default=50.0, ge=0, description="Islas más chicas se absorben en la zona vecina")

    @field_validator("doses")
    @classmethod
    def _non_negative(cls, v: list[float]) -> list[float]:
        if any(d < 0 for d in v):
            raise ValueError("Las dosis no pueden ser negativas")
        return v

    @model_validator(mode="after")
    def _match(self):
        if len(self.doses) != self.num_zones:
            raise ValueError(f"Se esperaban {self.num_zones} dosis y llegaron {len(self.doses)}")
        return self


class PrescriptionOut(Out):
    id: int
    flight_id: int
    name: str
    product: str | None
    unit: str
    num_zones: int
    method: str
    doses: list[float]
    min_area_m2: float
    status: str
    error: str | None
    summary: dict | None
    created_at: datetime


TokenOut.model_rebuild()
