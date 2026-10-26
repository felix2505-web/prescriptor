import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User, UserStatus

ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    # bcrypt solo usa los primeros 72 bytes; se pre-hashea para no truncar en silencio.
    digest = hashlib.sha256(password.encode()).hexdigest().encode()
    return bcrypt.hashpw(digest, bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    digest = hashlib.sha256(password.encode()).hexdigest().encode()
    try:
        return bcrypt.checkpw(digest, hashed.encode())
    except ValueError:
        return False


def new_activation_code() -> str:
    # Mantiene el prefijo que ya usa el frontend actual.
    return "PRESC-ACT-" + secrets.token_urlsafe(18)


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode()).hexdigest()


def create_access_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "usr": user.username,
        "adm": user.is_admin,
        "iat": now,
        "exp": now + timedelta(minutes=s.access_token_minutes),
    }
    return jwt.encode(payload, s.secret_key, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    cred_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión inválida o expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise cred_error
    user = db.get(User, user_id)
    if user is None or user.status != UserStatus.ACTIVO:
        raise cred_error
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Solo el administrador puede hacer esto")
    return user
