from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Field, Flight, User
from ..schemas import FieldIn, FieldOut, FlightOut
from ..security import get_current_user
from ..storage import flight_dir, prescription_dir, remove_tree
from .deps import own_field

router = APIRouter(prefix="/lotes", tags=["Lotes"])


def _out(f: Field, count: int) -> FieldOut:
    o = FieldOut.model_validate(f)
    o.flights_count = count
    return o


@router.get("", response_model=list[FieldOut])
def list_fields(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = (
        select(Field, func.count(Flight.id))
        .outerjoin(Flight, Flight.field_id == Field.id)
        .where(Field.owner_id == user.id)
        .group_by(Field.id)
        .order_by(Field.name)
    )
    return [_out(f, c) for f, c in db.execute(q).all()]


@router.post("", response_model=FieldOut, status_code=201)
def create_field(data: FieldIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = Field(owner_id=user.id, **data.model_dump())
    db.add(f)
    db.commit()
    return _out(f, 0)


@router.get("/{field_id}", response_model=FieldOut)
def get_field(field_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = own_field(db, user, field_id)
    return _out(f, len(f.flights))


@router.put("/{field_id}", response_model=FieldOut)
def update_field(field_id: int, data: FieldIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = own_field(db, user, field_id)
    for k, v in data.model_dump().items():
        setattr(f, k, v)
    db.commit()
    return _out(f, len(f.flights))


@router.delete("/{field_id}", status_code=204)
def delete_field(field_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = own_field(db, user, field_id)
    dirs = []
    for fl in f.flights:
        dirs.append(flight_dir(fl.id))
        dirs += [prescription_dir(rx.id) for rx in fl.prescriptions]
    db.delete(f)
    db.commit()
    for d in dirs:
        remove_tree(d)


@router.get("/{field_id}/vuelos", response_model=list[FlightOut])
def field_history(field_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Historial de vuelos del lote, del más reciente al más antiguo."""
    own_field(db, user, field_id)
    q = select(Flight).where(Flight.field_id == field_id).order_by(Flight.flight_date.desc(), Flight.id.desc())
    return db.scalars(q).all()
