"""Genera ortomosaicos sintéticos para pruebas (lote en Chile central, UTM 19S)."""
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin


def make_multiband(path: Path, width: int = 600, height: int = 400, px: float = 0.1, seed: int = 1) -> Path:
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:height, 0:width]
    # Gradiente de vigor de oeste a este + manchas, como un potrero real
    vigor = 0.15 + 0.65 * (xx / width) + 0.1 * np.sin(yy / 40.0) + rng.normal(0, 0.03, (height, width))
    vigor = np.clip(vigor, 0.05, 0.95)
    nir = (0.45 + 0.4 * vigor) * 10000
    red = nir * (1 - vigor) / (1 + vigor)
    green = red * 1.2
    rededge = nir * 0.8
    data = np.stack([green, red, rededge, nir]).astype("uint16")
    # Bordes fuera del lote (nodata = 0)
    data[:, :, :20] = 0
    data[:, :15, :] = 0
    profile = {
        "driver": "GTiff", "width": width, "height": height, "count": 4, "dtype": "uint16",
        "crs": "EPSG:32719", "transform": from_origin(340000, 6290000, px, px), "nodata": 0,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data)
    return path


def make_ndvi(path: Path, width: int = 300, height: int = 200) -> Path:
    yy, xx = np.mgrid[0:height, 0:width]
    ndvi = (0.2 + 0.6 * xx / width).astype("float32")
    profile = {
        "driver": "GTiff", "width": width, "height": height, "count": 1, "dtype": "float32",
        "crs": "EPSG:4326", "transform": from_origin(-71.0, -33.5, 0.000005, 0.000005), "nodata": -9999,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(ndvi, 1)
    return path
