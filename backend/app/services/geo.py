"""Utilidades geográficas compartidas."""
import math

import numpy as np
import shapely
from pyproj import CRS, Transformer
from shapely.geometry.base import BaseGeometry

WGS84 = CRS.from_epsg(4326)


def pixel_size_m(transform, crs) -> float:
    """Tamaño aproximado del píxel en metros (lado), aun si el ráster está en grados."""
    px = abs(transform.a)
    crs = CRS.from_user_input(crs)
    if crs.is_geographic:
        lat = transform.f + transform.e * 0.5  # aproximación al borde superior
        return px * 111_320 * max(math.cos(math.radians(lat)), 0.01)
    return px * crs.axis_info[0].unit_conversion_factor


def utm_for(geom_wgs84: BaseGeometry) -> CRS:
    c = geom_wgs84.centroid
    zone = int((c.x + 180) // 6) + 1
    epsg = (32600 if c.y >= 0 else 32700) + zone
    return CRS.from_epsg(epsg)


def reproject_geom(geom: BaseGeometry, src_crs, dst_crs) -> BaseGeometry:
    t = Transformer.from_crs(CRS.from_user_input(src_crs), CRS.from_user_input(dst_crs), always_xy=True)

    def _xy(coords: np.ndarray) -> np.ndarray:
        x, y = t.transform(coords[:, 0], coords[:, 1])
        return np.column_stack([x, y])

    return shapely.transform(geom, _xy)


def area_m2(geom_wgs84: BaseGeometry) -> float:
    return reproject_geom(geom_wgs84, WGS84, utm_for(geom_wgs84)).area
