from datetime import datetime, time, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field as PField
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import ChatMessage, Conversation, User, utcnow
from ..security import get_current_user
from ..services.assistant import AssistantError, MessagesClient, answer

router = APIRouter(prefix="/asistente", tags=["Asistente IA"])


# ---------- Cliente de Claude ----------

@lru_cache
def _anthropic_messages(api_key: str):
    import anthropic

    return anthropic.Anthropic(api_key=api_key, timeout=90, max_retries=2).messages


def get_ai_client() -> MessagesClient | None:
    """Devuelve el cliente de mensajes, o None si no hay clave configurada. Los tests lo reemplazan."""
    key = get_settings().anthropic_api_key
    return _anthropic_messages(key) if key else None


# ---------- Esquemas ----------

class QuestionIn(BaseModel):
    mensaje: str = PField(min_length=1, max_length=4000)
    conversacion_id: int | None = None
    pantalla: str | None = PField(
        default=None, max_length=200_000,
        description="Texto visible en la aplicación, para que el asistente entienda de qué se habla",
    )


class AnswerOut(BaseModel):
    conversacion_id: int
    respuesta: str
    usadas_hoy: int
    limite_diario: int | None


class StatusOut(BaseModel):
    activo: bool
    usadas_hoy: int
    limite_diario: int | None


class ConversationOut(BaseModel):
    id: int
    titulo: str
    actualizada: datetime


class MessageOut(BaseModel):
    rol: str
    contenido: str
    fecha: datetime


class ConversationDetail(ConversationOut):
    mensajes: list[MessageOut]


# ---------- Uso diario ----------

def _limit_for(user: User) -> int | None:
    return None if user.is_admin else get_settings().assistant_daily_limit


def _used_today(db: Session, user: User) -> int:
    tz = ZoneInfo(get_settings().timezone)
    start_local = datetime.combine(datetime.now(tz).date(), time.min, tzinfo=tz)
    start_utc = start_local.astimezone(timezone.utc)
    return db.scalar(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.user_id == user.id, ChatMessage.role == "user", ChatMessage.created_at >= start_utc
        )
    ) or 0


def _own_conversation(db: Session, user: User, conv_id: int) -> Conversation:
    c = db.get(Conversation, conv_id)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "Conversación no encontrada")
    return c


# ---------- Rutas ----------

@router.get("/estado", response_model=StatusOut)
def status(
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
    client: MessagesClient | None = Depends(get_ai_client),
):
    return StatusOut(activo=client is not None, usadas_hoy=_used_today(db, user), limite_diario=_limit_for(user))


@router.post("/consultar", response_model=AnswerOut)
def ask(
    data: QuestionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    client: MessagesClient | None = Depends(get_ai_client),
):
    """Envía una pregunta al asistente. Sin `conversacion_id` empieza una conversación nueva."""
    s = get_settings()
    if client is None:
        raise HTTPException(503, "El asistente no está configurado todavía. Falta la clave ANTHROPIC_API_KEY en el servidor.")

    limit = _limit_for(user)
    used = _used_today(db, user)
    if limit is not None and used >= limit:
        raise HTTPException(429, f"Llegaste al límite de {limit} consultas de hoy. Mañana se renueva.")

    question = data.mensaje.strip()
    if not question:
        raise HTTPException(400, "Escribe una pregunta")

    if data.conversacion_id:
        conv = _own_conversation(db, user, data.conversacion_id)
        previous = conv.messages[-s.assistant_history:]
        # El historial debe empezar con un turno del usuario
        while previous and previous[0].role != "user":
            previous = previous[1:]
        history = [{"role": m.role, "content": m.content} for m in previous]
    else:
        conv = None
        history = []

    screen = (data.pantalla or "").strip()
    if screen:
        screen = " ".join(screen.split())[: s.assistant_screen_chars]

    try:
        result = answer(client, db, user, history, question, screen or None)
    except AssistantError as e:
        raise HTTPException(502, str(e))

    if conv is None:
        title = " ".join(question.split())[:80]
        conv = Conversation(user_id=user.id, title=title + ("…" if len(question) > 80 else ""))
        db.add(conv)
        db.flush()
    now = utcnow()
    db.add_all([
        ChatMessage(conversation_id=conv.id, user_id=user.id, role="user", content=question, created_at=now),
        ChatMessage(
            conversation_id=conv.id, user_id=user.id, role="assistant", content=result["text"],
            input_tokens=result["input_tokens"], output_tokens=result["output_tokens"], created_at=now,
        ),
    ])
    conv.updated_at = now
    db.commit()
    return AnswerOut(conversacion_id=conv.id, respuesta=result["text"], usadas_hoy=used + 1, limite_diario=limit)


@router.get("/conversaciones", response_model=list[ConversationOut])
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Conversation).where(Conversation.user_id == user.id).order_by(Conversation.updated_at.desc()).limit(50)
    return [ConversationOut(id=c.id, titulo=c.title, actualizada=c.updated_at) for c in db.scalars(q)]


@router.get("/conversaciones/{conv_id}", response_model=ConversationDetail)
def get_conversation(conv_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _own_conversation(db, user, conv_id)
    return ConversationDetail(
        id=c.id, titulo=c.title, actualizada=c.updated_at,
        mensajes=[MessageOut(rol=m.role, contenido=m.content, fecha=m.created_at) for m in c.messages],
    )


@router.delete("/conversaciones/{conv_id}", status_code=204)
def delete_conversation(conv_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _own_conversation(db, user, conv_id)
    db.delete(c)
    db.commit()
