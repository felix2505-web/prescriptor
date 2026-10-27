# Imagen del backend del Prescriptor NDVI
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/data \
    DATABASE_URL=sqlite:////data/prescriptor.db \
    GDAL_CACHEMAX=64 \
    PORT=8000

WORKDIR /app

# rasterio, shapely y pyproj traen GDAL/GEOS/PROJ en sus wheels: no hace falta instalar GDAL del sistema.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# Se ejecuta como root para poder escribir en discos persistentes montados por el proveedor (Render, etc.).
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/salud')" || exit 1

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
