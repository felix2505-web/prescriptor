"""Imágenes PNG de los mapas (NDVI y zonas) para la API y el informe."""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from matplotlib.colors import BoundaryNorm, ListedColormap  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

from .ndvi import NODATA  # noqa: E402

INK = "#1a1b23"
MUTED = "#5e6e82"
# Convención agronómica: rojo = vigor bajo, verde = vigor alto.
NDVI_CMAP = "RdYlGn"


def _style(ax):
    ax.set_axis_off()
    ax.set_aspect("equal")


# Rampa rojo→verde sin amarillo pálido en el medio, para que toda zona contraste con el fondo blanco.
_ZONE_STOPS = ["#c0392b", "#e67e22", "#d4a017", "#7cb342", "#2e7d32"]


def zone_colors(n: int) -> list[str]:
    cmap = matplotlib.colors.LinearSegmentedColormap.from_list("zonas", _ZONE_STOPS)
    return [matplotlib.colors.to_hex(cmap(i / max(n - 1, 1))) for i in range(n)]


def ndvi_png(analysis_path: Path, out_path: Path, dpi: int = 160) -> Path:
    with rasterio.open(analysis_path) as src:
        arr = src.read(1, masked=True)
    arr = np.ma.masked_equal(arr, NODATA)
    lo, hi = np.percentile(arr.compressed(), [2, 98]) if arr.count() else (0, 1)
    h, w = arr.shape
    fig, ax = plt.subplots(figsize=(7, 7 * h / w + 0.6))
    im = ax.imshow(arr, cmap=NDVI_CMAP, vmin=lo, vmax=hi, interpolation="nearest")
    _style(ax)
    cb = fig.colorbar(im, ax=ax, orientation="horizontal", fraction=0.05, pad=0.03)
    cb.set_label("NDVI", color=INK)
    cb.ax.tick_params(colors=MUTED, labelsize=8)
    cb.outline.set_visible(False)
    fig.savefig(out_path, dpi=dpi, bbox_inches="tight", transparent=True)
    plt.close(fig)
    return out_path


def zones_png(zones_path: Path, out_path: Path, labels: list[str], dpi: int = 160) -> Path:
    with rasterio.open(zones_path) as src:
        arr = src.read(1)
    n = len(labels)
    colors = zone_colors(n)
    cmap = ListedColormap(colors)
    norm = BoundaryNorm(np.arange(0.5, n + 1.5), n)
    h, w = arr.shape
    fig, ax = plt.subplots(figsize=(7, 7 * h / w + 0.8))
    ax.imshow(np.ma.masked_equal(arr, 0), cmap=cmap, norm=norm, interpolation="nearest")
    _style(ax)
    handles = [Patch(facecolor=c, edgecolor="none", label=lab) for c, lab in zip(colors, labels)]
    ax.legend(
        handles=handles, loc="upper center", bbox_to_anchor=(0.5, -0.02), ncol=min(n, 4),
        frameon=False, fontsize=8, labelcolor=INK,
    )
    fig.savefig(out_path, dpi=dpi, bbox_inches="tight", transparent=True)
    plt.close(fig)
    return out_path
