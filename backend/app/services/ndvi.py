"""Cálculo de NDVI a partir de ortomosaicos.

Dos modos de entrada:
- "multibanda": GeoTIFF con varias bandas (ej. ortomosaico de Mavic 3M en DJI Terra);
  se indican las bandas Rojo y NIR (numeradas desde 1).
- "ndvi": GeoTIFF de una banda que ya contiene NDVI (valores entre -1 y 1).

Se genera:
- ndvi.tif           NDVI a resolución completa (float32, procesado por bloques).
- ndvi_analisis.tif  NDVI remuestreado a ~analysis_res_m, que usan la zonificación y el informe.
"""
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from rasterio.windows import Window

from .geo import WGS84, pixel_size_m

NODATA = -9999.0
ANALYSIS_RES_M = 0.5  # 50 cm sobra para dosis variable con drones


class NDVIError(ValueError):
    pass


def _iter_windows(width: int, height: int, size: int = 1024):
    for row in range(0, height, size):
        for col in range(0, width, size):
            yield Window(col, row, min(size, width - col), min(size, height - row))


def _band_valid(arr: np.ndarray, nodata) -> np.ndarray:
    valid = np.isfinite(arr)
    if nodata is not None and not np.isnan(nodata):
        valid &= arr != nodata
    return valid


def compute_ndvi(
    src_path: Path,
    out_dir: Path,
    mode: str,
    red_band: int | None = None,
    nir_band: int | None = None,
    analysis_res_m: float = ANALYSIS_RES_M,
) -> dict:
    full_path = out_dir / "ndvi.tif"
    analysis_path = out_dir / "ndvi_analisis.tif"

    try:
        src = rasterio.open(src_path)
    except rasterio.RasterioIOError as e:
        raise NDVIError("El archivo no es un GeoTIFF válido") from e

    with src:
        if src.crs is None:
            raise NDVIError("El GeoTIFF no tiene sistema de coordenadas (CRS). Expórtalo georreferenciado.")
        if mode == "multibanda":
            if not red_band or not nir_band:
                raise NDVIError("Indica las bandas Rojo y NIR")
            for b in (red_band, nir_band):
                if b < 1 or b > src.count:
                    raise NDVIError(f"La banda {b} no existe: el archivo tiene {src.count} banda(s)")
            if red_band == nir_band:
                raise NDVIError("Rojo y NIR no pueden ser la misma banda")
        elif mode == "ndvi":
            if src.count < 1:
                raise NDVIError("El archivo no tiene bandas")
        else:
            raise NDVIError("Modo desconocido")

        profile = src.profile.copy()
        profile.update(
            driver="GTiff", count=1, dtype="float32", nodata=NODATA,
            compress="deflate", predictor=3, tiled=True, blockxsize=512, blockysize=512,
            BIGTIFF="IF_SAFER",
        )
        profile.pop("photometric", None)
        nodata_in = src.nodata
        alpha_idx = None
        if src.count > 1 and src.colorinterp and src.colorinterp[-1].name == "alpha":
            alpha_idx = src.count

        scale_checked = False
        with rasterio.open(full_path, "w", **profile) as dst:
            for win in _iter_windows(src.width, src.height):
                if mode == "multibanda":
                    red = src.read(red_band, window=win).astype("float32")
                    nir = src.read(nir_band, window=win).astype("float32")
                    valid = _band_valid(red, nodata_in) & _band_valid(nir, nodata_in)
                    denom = nir + red
                    valid &= denom > 0
                    if alpha_idx:
                        valid &= src.read(alpha_idx, window=win) > 0
                    ndvi = np.full(red.shape, NODATA, dtype="float32")
                    np.divide(nir - red, denom, out=ndvi, where=valid)
                else:
                    ndvi = src.read(1, window=win).astype("float32")
                    valid = _band_valid(ndvi, nodata_in)
                    if not scale_checked and valid.any():
                        vmax = float(np.nanmax(np.abs(ndvi[valid])))
                        if vmax > 1.5:
                            raise NDVIError(
                                "El ráster no parece NDVI (valores fuera de -1 a 1). "
                                "Si es un ortomosaico multiespectral, usa el modo «multibanda»."
                            )
                        scale_checked = True
                ndvi = np.where(valid, np.clip(ndvi, -1, 1), NODATA).astype("float32")
                dst.write(ndvi, 1, window=win)

        # Ráster de análisis remuestreado (promedio)
        px = pixel_size_m(src.transform, src.crs)
        factor = max(1.0, analysis_res_m / px) if px > 0 else 1.0
        out_w = max(1, int(round(src.width / factor)))
        out_h = max(1, int(round(src.height / factor)))
        bounds_wgs = transform_bounds(src.crs, WGS84, *src.bounds)
        crs = src.crs

    with rasterio.open(full_path) as full:
        small = full.read(1, out_shape=(out_h, out_w), resampling=Resampling.average, masked=True)
        transform = full.transform @ Affine.scale(full.width / out_w, full.height / out_h)
    arr = small.filled(NODATA).astype("float32")
    a_profile = {
        "driver": "GTiff", "width": out_w, "height": out_h, "count": 1, "dtype": "float32",
        "crs": crs, "transform": transform, "nodata": NODATA, "compress": "deflate",
    }
    with rasterio.open(analysis_path, "w", **a_profile) as dst:
        dst.write(arr, 1)

    valid_vals = arr[arr != NODATA]
    if valid_vals.size < 10:
        raise NDVIError("El ráster casi no tiene píxeles válidos")

    pix_m = pixel_size_m(transform, crs)
    hist, edges = np.histogram(valid_vals, bins=20, range=(-1, 1))
    pct = np.percentile(valid_vals, [2, 10, 25, 50, 75, 90, 98])
    return {
        "min": round(float(valid_vals.min()), 4),
        "max": round(float(valid_vals.max()), 4),
        "media": round(float(valid_vals.mean()), 4),
        "desv": round(float(valid_vals.std()), 4),
        "percentiles": {k: round(float(v), 4) for k, v in zip(["p2", "p10", "p25", "p50", "p75", "p90", "p98"], pct)},
        "area_ha": round(float(valid_vals.size * pix_m * pix_m / 10_000), 3),
        "resolucion_original_m": round(px, 3),
        "resolucion_analisis_m": round(pix_m, 3),
        "ancho_px": out_w,
        "alto_px": out_h,
        "crs": crs.to_string(),
        "limites_wgs84": [round(b, 7) for b in bounds_wgs],
        "histograma": {"conteos": hist.tolist(), "bordes": [round(e, 2) for e in edges.tolist()]},
    }
