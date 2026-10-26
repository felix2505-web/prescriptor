from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..mailer import activation_mail, send_mail
from ..models import User, UserStatus
from ..schemas import ApprovalOut, UserOut
from ..security import hash_code, new_activation_code, require_admin

router = APIRouter(prefix="/admin", tags=["Administración"], dependencies=[Depends(require_admin)])


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Usuario no encontrado")
    return user


@router.get("/usuarios", response_model=list[UserOut])
def list_users(estado: UserStatus | None = None, db: Session = Depends(get_db)):
    q = select(User).order_by(User.created_at.desc())
    if estado:
        q = q.where(User.status == estado)
    return db.scalars(q).all()


def _issue_code(user: User, db: Session) -> ApprovalOut:
    s = get_settings()
    code = new_activation_code()
    expires = datetime.now(timezone.utc) + timedelta(hours=s.activation_code_hours)
    user.status = UserStatus.APROBADO
    user.activation_hash = hash_code(code)
    user.activation_expires = expires
    user.approved_at = datetime.now(timezone.utc)
    db.commit()
    subject, body = activation_mail(user.full_name, code, s.activation_code_hours)
    sent = send_mail(user.email, subject, body)
    return ApprovalOut(
        user=UserOut.model_validate(user),
        email_sent=sent,
        activation_code=None if sent else code,
        expires_at=expires,
    )


@router.post("/usuarios/{user_id}/aprobar", response_model=ApprovalOut)
def approve(user_id: int, db: Session = Depends(get_db)):
    """Aprueba la solicitud y envía el código de activación (o lo devuelve si no hay SMTP)."""
    user = _get_user(db, user_id)
    if user.status not in (UserStatus.PENDIENTE, UserStatus.APROBADO, UserStatus.RECHAZADO):
        raise HTTPException(400, f"No se puede aprobar una cuenta en estado «{user.status}»")
    return _issue_code(user, db)


@router.post("/usuarios/{user_id}/rechazar", response_model=UserOut)
def reject(user_id: int, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    if user.is_admin:
        raise HTTPException(400, "No puedes rechazar a un administrador")
    user.status = UserStatus.RECHAZADO
    user.activation_hash = None
    db.commit()
    return user


@router.post("/usuarios/{user_id}/suspender", response_model=UserOut)
def suspend(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = _get_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(400, "No puedes suspenderte a ti mismo")
    user.status = UserStatus.SUSPENDIDO
    db.commit()
    return user


@router.post("/usuarios/{user_id}/reactivar", response_model=UserOut)
def reactivate(user_id: int, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    if user.status != UserStatus.SUSPENDIDO:
        raise HTTPException(400, "Solo se reactivan cuentas suspendidas")
    user.status = UserStatus.ACTIVO
    db.commit()
    return user
