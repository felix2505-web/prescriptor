import logging
import re
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..db import get_db, session_factory
from ..models import Flight, JobStatus, User
from ..schemas import FlightOut
from ..security import get_current_user
from ..services.maps import ndvi_png
from ..services.ndvi import NDVIError, compute_ndvi
from ..storage import flight_dir, prescription_dir, remove_tree, save_upload
from .deps import own_field, own_flight

log = logging.getLogger("prescriptor.vuelos")
router = APIRouter(tags=["Vuelos"])
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def process_flight(flight_id: int) -> None:
    """Calcula el NDVI en segundo plano y guarda el estado en la BD."""
    db = session_factory()()
    try:
        fl = db.get(Flight, flight_id)
        if fl is None:
            return
        fl.status = JobStatus.PROCESANDO
        db.commit()
        d = flight_dir(fl.id)
        try:
            fl.stats = compute_ndvi(d / "original.tif", d, fl.source_mode, fl.red_band, fl.nir_band)
            fl.status = JobStatus.LISTO
            fl.error = None
            (d / "original.tif").unlink(missing_ok=True)  # ndvi.tif ya contiene lo necesario
        except NDVIError as e:
            fl.status, fl.error = JobStatus.ERROR, str(e)
        except Exception:  # noqa: BLE001
            log.exception("Error procesando vuelo %s", flight_id)
            fl.status, fl.error = JobStatus.ERROR, "Error inesperado al procesar la imagen"
        db.commit()
    finally:
        db.close()


@router.post("/lotes/{field_id}/vuelos", response_model=FlightOut, status_code=202)
def upload_flight(
    field_id: int,
    background: BackgroundTasks,
    archivo: UploadFile = File(..., description="GeoTIFF del ortomosaico o del NDVI"),
    modo: Literal["multibanda", "ndvi"] = Form("multibanda"),
    banda_rojo: int | None = Form(None, ge=1),
    banda_nir: int | None = Form(None, ge=1),
    fecha_vuelo: str | None = Form(None, description="AAAA-MM-DD"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sube una imagen y la procesa en segundo plano. Consulta el estado con GET /vuelos/{id}."""
    own_field(db, user, field_id)
    name = archivo.filename or "imagen.tif"
    if not name.lower().endswith((".tif", ".tiff")):
        raise HTTPException(400, "Sube un GeoTIFF (.tif o .tiff)")
    if fecha_vuelo and not DATE_RE.match(fecha_vuelo):
        raise HTTPException(400, "La fecha debe tener formato AAAA-MM-DD")
    if modo == "multibanda" and not (banda_rojo and banda_nir):
        raise HTTPException(400, "En modo multibanda indica banda_rojo y banda_nir")

    fl = Flight(
        field_id=field_id, flight_date=fecha_vuelo, source_mode=modo,
        red_band=banda_rojo if modo == "multibanda" else None,
        nir_band=banda_nir if modo == "multibanda" else None,
        original_filename=name[:255], status=JobStatus.PENDIENTE,
    )
    db.add(fl)
    db.commit()
    try:
        save_upload(archivo, flight_dir(fl.id) / "original.tif")
    except Exception:
        db.delete(fl)
        db.commit()
        remove_tree(flight_dir(fl.id))
        raise
    background.add_task(process_flight, fl.id)
    return fl


@router.get("/vuelos/{flight_id}", response_model=FlightOut)
def get_flight(flight_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return own_flight(db, user, flight_id)


def _ready(fl: Flight):
    if fl.status != JobStatus.LISTO:
        raise HTTPException(409, f"El vuelo está «{fl.status}»")


@router.get("/vuelos/{flight_id}/ndvi.png", response_class=FileResponse)
def flight_ndvi_png(flight_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fl = own_flight(db, user, flight_id)
    _ready(fl)
    d = flight_dir(fl.id)
    png = d / "mapa_ndvi.png"
    if not png.exists():
        ndvi_png(d / "ndvi_analisis.tif", png)
    return FileResponse(png, media_type="image/png")


@router.get("/vuelos/{flight_id}/ndvi.tif", response_class=FileResponse)
def flight_ndvi_tif(flight_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """NDVI a resolución completa, para abrir en QGIS u otro SIG."""
    fl = own_flight(db, user, flight_id)
    _ready(fl)
    return FileResponse(flight_dir(fl.id) / "ndvi.tif", media_type="image/tiff", filename=f"ndvi_vuelo_{fl.id}.tif")


@router.delete("/vuelos/{flight_id}", status_code=204)
def delete_flight(flight_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fl = own_flight(db, user, flight_id)
    dirs = [flight_dir(fl.id)] + [prescription_dir(rx.id) for rx in fl.prescriptions]
    db.delete(fl)
    db.commit()
    for d in dirs:
        remove_tree(d)
