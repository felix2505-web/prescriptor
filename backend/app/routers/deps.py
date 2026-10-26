from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Field, Flight, Prescription, User


def own_field(db: Session, user: User, field_id: int) -> Field:
    f = db.get(Field, field_id)
    if f is None or (f.owner_id != user.id and not user.is_admin):
        raise HTTPException(404, "Lote no encontrado")
    return f


def own_flight(db: Session, user: User, flight_id: int) -> Flight:
    fl = db.get(Flight, flight_id)
    if fl is None:
        raise HTTPException(404, "Vuelo no encontrado")
    own_field(db, user, fl.field_id)
    return fl


def own_prescription(db: Session, user: User, rx_id: int) -> Prescription:
    rx = db.get(Prescription, rx_id)
    if rx is None:
        raise HTTPException(404, "Prescripción no encontrada")
    own_flight(db, user, rx.flight_id)
    return rx
