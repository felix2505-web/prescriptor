from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import User, UserStatus
from ..schemas import AccountRequest, ActivateIn, ChangePasswordIn, TokenOut, UserOut
from ..security import create_access_token, get_current_user, hash_code, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Cuentas"])


@router.post("/solicitar", status_code=status.HTTP_201_CREATED)
def request_account(data: AccountRequest, db: Session = Depends(get_db)):
    """Pestaña «Solicitar cuenta». La cuenta queda pendiente hasta que el admin la apruebe."""
    exists = db.scalar(
        select(User).where(or_(User.username == data.username, User.email == data.email.lower()))
    )
    if exists:
        raise HTTPException(409, "Ese usuario o correo ya tiene una solicitud o cuenta")
    user = User(
        username=data.username,
        email=data.email.lower(),
        full_name=data.full_name.strip(),
        password_hash=hash_password(data.password),
        status=UserStatus.PENDIENTE,
    )
    db.add(user)
    db.commit()
    return {"ok": True, "mensaje": "Solicitud enviada. Recibirás un código cuando el administrador la apruebe."}


@router.post("/activar")
def activate(data: ActivateIn, db: Session = Depends(get_db)):
    """Pestaña «Activar cuenta»: canjea el código recibido por correo."""
    user = db.scalar(select(User).where(User.activation_hash == hash_code(data.code)))
    if user is None or user.status != UserStatus.APROBADO:
        raise HTTPException(400, "Código inválido o ya usado")
    if user.activation_expires and user.activation_expires.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(400, "El código venció. Pide al administrador uno nuevo.")
    user.status = UserStatus.ACTIVO
    user.activation_hash = None
    user.activation_expires = None
    db.commit()
    return {"ok": True, "mensaje": "Cuenta activada. Ya puedes ingresar.", "username": user.username}


@router.post("/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Pestaña «Ingresar». Acepta usuario o correo."""
    ident = form.username.strip()
    user = db.scalar(select(User).where(or_(User.username == ident, User.email == ident.lower())))
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    if user.status != UserStatus.ACTIVO:
        msg = {
            UserStatus.PENDIENTE: "Tu solicitud aún no fue aprobada",
            UserStatus.APROBADO: "Activa tu cuenta con el código que te llegó por correo",
            UserStatus.RECHAZADO: "Tu solicitud fue rechazada",
            UserStatus.SUSPENDIDO: "Tu cuenta está suspendida",
        }.get(user.status, "Cuenta no habilitada")
        raise HTTPException(403, msg)
    return TokenOut(
        access_token=create_access_token(user),
        expires_in=get_settings().access_token_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.get("/yo", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/cambiar-clave")
def change_password(data: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "La contraseña actual no coincide")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"ok": True}
