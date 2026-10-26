import logging
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, session_factory
from ..models import Flight, JobStatus, Prescription, User
from ..schemas import PrescriptionIn, PrescriptionOut
from ..security import get_current_user
from ..services.maps import zones_png
from ..services.prescription import PrescriptionError, build_prescription
from ..services.report import build_report
from ..storage import flight_dir, prescription_dir, remove_tree
from .deps import own_flight, own_prescription

log = logging.getLogger("prescriptor.rx")
router = APIRouter(tags=["Prescripciones"])


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", s).strip("_")[:60] or "prescripcion"


def process_prescription(rx_id: int) -> None:
    db = session_factory()()
    try:
        rx = db.get(Prescription, rx_id)
        if rx is None:
            return
        rx.status = JobStatus.PROCESANDO
        db.commit()
        try:
            rx.summary = build_prescription(
                flight_dir(rx.flight_id) / "ndvi_analisis.tif", prescription_dir(rx.id),
                num_zones=rx.num_zones, method=rx.method, doses=rx.doses, min_area_m2=rx.min_area_m2,
                unit=rx.unit, product=rx.product, name=rx.name,
            )
            rx.status, rx.error = JobStatus.LISTO, None
        except PrescriptionError as e:
            rx.status, rx.error = JobStatus.ERROR, str(e)
        except Exception:  # noqa: BLE001
            log.exception("Error generando prescripción %s", rx_id)
            rx.status, rx.error = JobStatus.ERROR, "Error inesperado al generar la prescripción"
        db.commit()
    finally:
        db.close()


@router.post("/vuelos/{flight_id}/prescripciones", response_model=PrescriptionOut, status_code=202)
def create_prescription(
    flight_id: int, data: PrescriptionIn, background: BackgroundTasks,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Zonifica el NDVI del vuelo y genera el mapa de dosis variable.

    `doses` va ordenado de NDVI bajo a NDVI alto: [dosis zona 1, dosis zona 2, ...].
    """
    fl = own_flight(db, user, flight_id)
    if fl.status != JobStatus.LISTO:
        raise HTTPException(409, f"El vuelo está «{fl.status}»; espera a que termine de procesarse")
    rx = Prescription(flight_id=fl.id, status=JobStatus.PENDIENTE, **data.model_dump())
    db.add(rx)
    db.commit()
    background.add_task(process_prescription, rx.id)
    return rx


@router.get("/vuelos/{flight_id}/prescripciones", response_model=list[PrescriptionOut])
def list_prescriptions(flight_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    own_flight(db, user, flight_id)
    q = select(Prescription).where(Prescription.flight_id == flight_id).order_by(Prescription.id.desc())
    return db.scalars(q).all()


@router.get("/prescripciones/{rx_id}", response_model=PrescriptionOut)
def get_prescription(rx_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return own_prescription(db, user, rx_id)


def _ready(rx: Prescription):
    if rx.status != JobStatus.LISTO:
        raise HTTPException(409, f"La prescripción está «{rx.status}»")


@router.get("/prescripciones/{rx_id}/descargar", response_class=FileResponse)
def download_zip(rx_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """ZIP con la carpeta DJI (límite + Rx) para la microSD del Agras, y las zonas en shapefile/GeoJSON."""
    rx = own_prescription(db, user, rx_id)
    _ready(rx)
    return FileResponse(
        prescription_dir(rx.id) / "prescripcion.zip", media_type="application/zip",
        filename=f"{_slug(rx.name)}_{rx.id}.zip",
    )


@router.get("/prescripciones/{rx_id}/zonas.geojson", response_class=FileResponse)
def zones_geojson(rx_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Zonas en GeoJSON (WGS84), para dibujarlas en un mapa web."""
    rx = own_prescription(db, user, rx_id)
    _ready(rx)
    return FileResponse(prescription_dir(rx.id) / "zonas" / "zonas.geojson", media_type="application/geo+json")


@router.get("/prescripciones/{rx_id}/zonas.png", response_class=FileResponse)
def zones_image(rx_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rx = own_prescription(db, user, rx_id)
    _ready(rx)
    d = prescription_dir(rx.id)
    png = d / "mapa_zonas.png"
    if not png.exists():
        labels = [f"Zona {z['zona']} · {z['dosis']:g} {rx.unit}" for z in rx.summary["zonas"]]
        zones_png(d / "zonas.tif", png, labels)
    return FileResponse(png, media_type="image/png")


@router.get("/prescripciones/{rx_id}/informe.pdf", response_class=FileResponse)
def report_pdf(rx_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Informe PDF con mapas, tabla de zonas, dosis y estadísticas."""
    rx = own_prescription(db, user, rx_id)
    _ready(rx)
    fl: Flight = rx.flight
    field = fl.field
    d = prescription_dir(rx.id)
    pdf = d / "informe.pdf"
    if not pdf.exists():
        build_report(
            pdf, d,
            field={"name": field.name, "crop": field.crop},
            flight={
                "flight_date": fl.flight_date, "original_filename": fl.original_filename, "stats": fl.stats,
                "analysis_path": str(flight_dir(fl.id) / "ndvi_analisis.tif"),
            },
            prescription={
                "name": rx.name, "product": rx.product, "unit": rx.unit, "num_zones": rx.num_zones,
                "method": rx.method, "summary": rx.summary,
            },
            author=field.owner.full_name,
        )
    return FileResponse(pdf, media_type="application/pdf", filename=f"informe_{_slug(rx.name)}_{rx.id}.pdf")


@router.delete("/prescripciones/{rx_id}", status_code=204)
def delete_prescription(rx_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rx = own_prescription(db, user, rx_id)
    d = prescription_dir(rx.id)
    db.delete(rx)
    db.commit()
    remove_tree(d)
