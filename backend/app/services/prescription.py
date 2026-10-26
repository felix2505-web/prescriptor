"""Zonificación del NDVI y exportación de mapas de prescripción.

Salidas (dentro de un .zip):
  DJI/Shapefile/limite.*   Límite del lote (WGS84) para crear la tarea en el control remoto.
  DJI/Rx/prescripcion.tif  Ráster de dosis por píxel en WGS84 (+ .tfw). Es lo que importa el Agras
                           como «Prescription Map» (Map Source: Other, Source unit: ha).
  zonas/zonas.*            Shapefile de zonas con ZONA, DOSIS, UNIDAD, AREA_HA, NDVI_* (QGIS, Pix4D, etc.).
  zonas/zonas.geojson      Lo mismo en GeoJSON.
"""
import json
import math
import zipfile
from pathlib import Path

import numpy as np
import rasterio
import shapefile  # pyshp
from pyproj.enums import WktVersion
from rasterio.features import shapes, sieve
from rasterio.warp import Resampling, calculate_default_transform, reproject
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.validation import make_valid

from .geo import WGS84, area_m2, pixel_size_m, reproject_geom
from .ndvi import NODATA


class PrescriptionError(ValueError):
    pass


def _thresholds(vals: np.ndarray, n: int, method: str) -> np.ndarray:
    if method == "cuantiles":
        thr = np.quantile(vals, np.linspace(0, 1, n + 1)[1:-1])
    else:  # intervalos iguales entre p2 y p98, para no dejar que valores extremos manden
        lo, hi = np.percentile(vals, [2, 98])
        thr = np.linspace(lo, hi, n + 1)[1:-1]
    if np.any(np.diff(thr) <= 1e-6):
        raise PrescriptionError(
            "El NDVI es demasiado uniforme para separarlo en tantas zonas. Prueba con menos zonas."
        )
    return thr


def _polygons_only(geom) -> MultiPolygon:
    geom = make_valid(geom)
    if isinstance(geom, Polygon):
        return MultiPolygon([geom])
    if isinstance(geom, MultiPolygon):
        return geom
    parts = [g for g in getattr(geom, "geoms", []) if isinstance(g, (Polygon, MultiPolygon))]
    polys = []
    for p in parts:
        polys.extend(p.geoms if isinstance(p, MultiPolygon) else [p])
    return MultiPolygon(polys)


def _write_shp(base: Path, records: list[tuple[MultiPolygon, dict]], fields: list[tuple]) -> None:
    base.parent.mkdir(parents=True, exist_ok=True)
    with shapefile.Writer(str(base), shapeType=shapefile.POLYGON, encoding="utf-8") as w:
        for f in fields:
            w.field(*f)
        for geom, attrs in records:
            parts = []
            for poly in geom.geoms:
                poly = orient(poly, sign=-1.0)  # anillo exterior en sentido horario (norma ESRI)
                parts.append(list(poly.exterior.coords))
                parts.extend(list(r.coords) for r in poly.interiors)
            w.poly(parts)
            w.record(*[attrs[f[0]] for f in fields])
    base.with_suffix(".prj").write_text(WGS84.to_wkt(WktVersion.WKT1_ESRI))
    base.with_suffix(".cpg").write_text("UTF-8")


def build_prescription(
    analysis_path: Path,
    out_dir: Path,
    *,
    num_zones: int,
    method: str,
    doses: list[float],
    min_area_m2: float,
    unit: str,
    product: str | None,
    name: str,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    with rasterio.open(analysis_path) as src:
        arr = src.read(1)
        transform, crs = src.transform, src.crs
    valid = arr != NODATA
    vals = arr[valid]
    if vals.size < num_zones * 10:
        raise PrescriptionError("No hay suficientes píxeles válidos para zonificar")

    thr = _thresholds(vals, num_zones, method)
    classes = np.zeros(arr.shape, dtype="uint8")
    classes[valid] = (np.digitize(vals, thr) + 1).astype("uint8")

    # Absorber islas pequeñas en la zona vecina
    pix = pixel_size_m(transform, crs)
    min_px = int(math.ceil(min_area_m2 / (pix * pix))) if pix > 0 else 0
    if min_px > 1:
        sieved = sieve(classes, size=min_px, mask=valid, connectivity=8)
        fix = valid & (sieved == 0)  # islas en el borde que quedaron sin zona
        sieved[fix] = classes[fix]
        classes = sieved.astype("uint8")

    zones_profile = {
        "driver": "GTiff", "width": arr.shape[1], "height": arr.shape[0], "count": 1,
        "dtype": "uint8", "crs": crs, "transform": transform, "nodata": 0, "compress": "deflate",
    }
    with rasterio.open(out_dir / "zonas.tif", "w", **zones_profile) as dst:
        dst.write(classes, 1)

    # Polígonos por zona
    by_zone: dict[int, list] = {z: [] for z in range(1, num_zones + 1)}
    for geom, val in shapes(classes, mask=classes > 0, transform=transform, connectivity=8):
        by_zone[int(val)].append(shape(geom))
    native_px = abs(transform.a)

    zone_records, zone_summary = [], []
    total_area = total_product = 0.0
    for z in range(1, num_zones + 1):
        if not by_zone[z]:
            continue
        g = unary_union(by_zone[z]).simplify(native_px * 0.5, preserve_topology=True)
        g_wgs = _polygons_only(reproject_geom(g, crs, WGS84))
        if g_wgs.is_empty:
            continue
        a_ha = area_m2(g_wgs) / 10_000
        zvals = arr[classes == z]
        dose = float(doses[z - 1])
        prod = dose * a_ha
        total_area += a_ha
        total_product += prod
        attrs = {
            "ZONA": z, "DOSIS": round(dose, 3), "UNIDAD": unit, "AREA_HA": round(a_ha, 4),
            "NDVI_MED": round(float(zvals.mean()), 4), "NDVI_MIN": round(float(zvals.min()), 4),
            "NDVI_MAX": round(float(zvals.max()), 4), "PRODUCTO": round(prod, 3),
        }
        zone_records.append((g_wgs, attrs))
        zone_summary.append({
            "zona": z, "dosis": attrs["DOSIS"], "area_ha": round(a_ha, 3),
            "ndvi_media": attrs["NDVI_MED"], "ndvi_min": attrs["NDVI_MIN"], "ndvi_max": attrs["NDVI_MAX"],
            "producto_total": round(prod, 2), "pct_area": 0.0,
        })
    if not zone_records:
        raise PrescriptionError("No se generaron zonas")
    for zs in zone_summary:
        zs["pct_area"] = round(100 * zs["area_ha"] / total_area, 1) if total_area else 0

    fields = [
        ("ZONA", "N", 3, 0), ("DOSIS", "F", 12, 3), ("UNIDAD", "C", 20), ("AREA_HA", "F", 14, 4),
        ("NDVI_MED", "F", 8, 4), ("NDVI_MIN", "F", 8, 4), ("NDVI_MAX", "F", 8, 4), ("PRODUCTO", "F", 14, 3),
    ]
    _write_shp(out_dir / "zonas" / "zonas", zone_records, fields)
    fc = {
        "type": "FeatureCollection",
        "name": name,
        "features": [{"type": "Feature", "properties": a, "geometry": mapping(g)} for g, a in zone_records],
    }
    (out_dir / "zonas" / "zonas.geojson").write_text(json.dumps(fc))

    # Límite exterior del lote (sin huecos, sin fragmentos minúsculos)
    union = _polygons_only(unary_union([g for g, _ in zone_records]))
    min_part = max(min_area_m2, 100.0)
    outer = [Polygon(p.exterior) for p in union.geoms if area_m2(Polygon(p.exterior)) >= min_part]
    if not outer:
        outer = [Polygon(p.exterior) for p in union.geoms]
    boundary = MultiPolygon(outer)
    _write_shp(
        out_dir / "DJI" / "Shapefile" / "limite", [(boundary, {"NOMBRE": name[:80]})], [("NOMBRE", "C", 80)]
    )

    # Ráster de dosis en WGS84 para el Agras
    rx_dir = out_dir / "DJI" / "Rx"
    rx_dir.mkdir(parents=True, exist_ok=True)
    with rasterio.open(out_dir / "zonas.tif") as zsrc:
        dst_t, w, h = calculate_default_transform(zsrc.crs, WGS84, zsrc.width, zsrc.height, *zsrc.bounds)
        zones_wgs = np.zeros((h, w), dtype="uint8")
        reproject(
            source=rasterio.band(zsrc, 1), destination=zones_wgs, src_transform=zsrc.transform,
            src_crs=zsrc.crs, dst_transform=dst_t, dst_crs=WGS84, resampling=Resampling.nearest,
            src_nodata=0, dst_nodata=0,
        )
    lut = np.zeros(num_zones + 1, dtype="float32")
    lut[1:] = np.asarray(doses, dtype="float32")
    rate = lut[zones_wgs]
    rx_profile = {
        "driver": "GTiff", "width": w, "height": h, "count": 1, "dtype": "float32",
        "crs": WGS84, "transform": dst_t, "compress": "deflate", "TFW": "YES",
    }
    with rasterio.open(rx_dir / "prescripcion.tif", "w", **rx_profile) as dst:
        dst.write(rate, 1)
        dst.update_tags(PRODUCTO=product or "", UNIDAD=unit, DESCRIPCION="Dosis por pixel; 0 = fuera del lote")

    summary = {
        "zonas": zone_summary,
        "umbrales_ndvi": [round(float(t), 4) for t in thr],
        "area_total_ha": round(total_area, 3),
        "producto_total": round(total_product, 2),
        "dosis_media": round(total_product / total_area, 3) if total_area else 0,
        "unidad": unit,
        "producto": product,
        "resolucion_m": round(pix, 3),
    }

    zip_path = out_dir / "prescripcion.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for sub in ("DJI", "zonas"):
            for f in sorted((out_dir / sub).rglob("*")):
                if f.is_file():
                    zf.write(f, f.relative_to(out_dir).as_posix())
        zf.writestr("LEEME.txt", _readme(name, summary))
    return summary


def _readme(name: str, s: dict) -> str:
    lines = [
        f"Prescripción: {name}",
        f"Producto: {s['producto'] or '-'}   Unidad: {s['unidad']}",
        f"Área: {s['area_total_ha']} ha   Producto total: {s['producto_total']}",
        "",
        "Zona  Dosis  Área(ha)  NDVI medio",
    ]
    for z in s["zonas"]:
        lines.append(f"{z['zona']:>4}  {z['dosis']:>5}  {z['area_ha']:>8}  {z['ndvi_media']:>10}")
    lines += [
        "",
        "Importar en el control remoto del Agras:",
        "1. Copia la carpeta DJI a la raíz de la microSD.",
        "2. Importa DJI/Shapefile/limite.shp como límite del campo.",
        "3. En «Prescription Map» elige DJI/Rx/prescripcion.tif.",
        "   Map Source: Other.  Source unit: ha.  Resample: Average o Max.",
        "4. Asigna la prescripción al campo y revisa las dosis antes de volar.",
        "",
        "Verifica siempre en el control que las dosis importadas coinciden con esta tabla.",
    ]
    return "\n".join(lines)
