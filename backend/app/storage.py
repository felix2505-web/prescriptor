import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import get_settings

CHUNK = 1024 * 1024


def flight_dir(flight_id: int) -> Path:
    d = get_settings().data_dir / "vuelos" / str(flight_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def prescription_dir(prescription_id: int) -> Path:
    d = get_settings().data_dir / "prescripciones" / str(prescription_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_upload(upload: UploadFile, dest: Path) -> int:
    """Guarda la subida por bloques y corta si supera el máximo permitido."""
    limit = get_settings().max_upload_mb * CHUNK
    written = 0
    with dest.open("wb") as out:
        while chunk := upload.file.read(CHUNK):
            written += len(chunk)
            if written > limit:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"El archivo supera {get_settings().max_upload_mb} MB")
            out.write(chunk)
    return written


def remove_tree(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)
