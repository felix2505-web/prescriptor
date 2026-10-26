"""Prueba de punta a punta: cuenta → lote → vuelo → prescripción → descargas e informe."""
import io
import zipfile

import numpy as np
import rasterio
from conftest import login
from synthetic import make_multiband, make_ndvi


def _new_active_user(client, admin_h, username, email):
    r = client.post("/auth/solicitar", json={
        "full_name": "Juan Pérez", "email": email, "username": username, "password": "clave-larga-1",
    })
    assert r.status_code == 201, r.text
    pend = client.get("/admin/usuarios", params={"estado": "pendiente"}, headers=admin_h).json()
    uid = next(u["id"] for u in pend if u["username"] == username)
    ap = client.post(f"/admin/usuarios/{uid}/aprobar", headers=admin_h)
    assert ap.status_code == 200, ap.text
    body = ap.json()
    assert body["email_sent"] is False and body["activation_code"].startswith("PRESC-ACT-")
    return uid, body["activation_code"]


def test_cuentas(client):
    admin_h = login(client, "admin", "admin-clave-segura")

    # Pendiente: no puede ingresar
    client.post("/auth/solicitar", json={
        "full_name": "Ana Soto", "email": "ana@campo.cl", "username": "ana", "password": "clave-larga-1"})
    r = client.post("/auth/login", data={"username": "ana", "password": "clave-larga-1"})
    assert r.status_code == 403 and "aprobada" in r.json()["detail"]

    # Duplicado
    r = client.post("/auth/solicitar", json={
        "full_name": "Ana Soto", "email": "ana@campo.cl", "username": "ana2", "password": "clave-larga-1"})
    assert r.status_code == 409

    # Un usuario normal no entra a /admin
    uid, code = _new_active_user(client, admin_h, "pedro", "pedro@campo.cl")
    r = client.post("/auth/login", data={"username": "pedro", "password": "clave-larga-1"})
    assert r.status_code == 403  # aprobado pero sin activar
    assert client.post("/auth/activar", json={"code": "PRESC-ACT-falso-falso"}).status_code == 400
    assert client.post("/auth/activar", json={"code": code}).status_code == 200
    assert client.post("/auth/activar", json={"code": code}).status_code == 400  # un solo uso
    h = login(client, "pedro@campo.cl", "clave-larga-1")  # también con correo
    assert client.get("/admin/usuarios", headers=h).status_code == 403
    assert client.get("/auth/yo", headers=h).json()["username"] == "pedro"

    # Suspensión corta la sesión
    client.post(f"/admin/usuarios/{uid}/suspender", headers=admin_h)
    assert client.get("/auth/yo", headers=h).status_code == 401
    client.post(f"/admin/usuarios/{uid}/reactivar", headers=admin_h)
    assert client.get("/auth/yo", headers=h).status_code == 200

    assert client.post("/auth/login", data={"username": "pedro", "password": "mala"}).status_code == 401
    assert client.get("/lotes").status_code == 401


def test_flujo_prescripcion(client, tmp_path):
    admin_h = login(client, "admin", "admin-clave-segura")
    _, code = _new_active_user(client, admin_h, "maria", "maria@campo.cl")
    client.post("/auth/activar", json={"code": code})
    h = login(client, "maria", "clave-larga-1")

    lote = client.post("/lotes", json={"name": "Potrero Norte", "crop": "Maíz"}, headers=h).json()

    # Errores de subida
    r = client.post(f"/lotes/{lote['id']}/vuelos", headers=h,
                    files={"archivo": ("a.jpg", b"x", "image/jpeg")}, data={"modo": "ndvi"})
    assert r.status_code == 400
    r = client.post(f"/lotes/{lote['id']}/vuelos", headers=h,
                    files={"archivo": ("a.tif", b"no-es-tif", "image/tiff")}, data={"modo": "ndvi"})
    assert r.status_code == 202
    assert client.get(f"/vuelos/{r.json()['id']}", headers=h).json()["status"] == "error"

    # Bandas inexistentes
    src = make_multiband(tmp_path / "orto.tif")
    with open(src, "rb") as f:
        r = client.post(f"/lotes/{lote['id']}/vuelos", headers=h, files={"archivo": ("orto.tif", f, "image/tiff")},
                        data={"modo": "multibanda", "banda_rojo": 2, "banda_nir": 9})
    fl = client.get(f"/vuelos/{r.json()['id']}", headers=h).json()
    assert fl["status"] == "error" and "no existe" in fl["error"]

    # Vuelo correcto
    with open(src, "rb") as f:
        r = client.post(f"/lotes/{lote['id']}/vuelos", headers=h, files={"archivo": ("orto.tif", f, "image/tiff")},
                        data={"modo": "multibanda", "banda_rojo": 2, "banda_nir": 4, "fecha_vuelo": "2026-10-20"})
    assert r.status_code == 202, r.text
    fl = client.get(f"/vuelos/{r.json()['id']}", headers=h).json()
    assert fl["status"] == "listo", fl
    assert 0.4 < fl["stats"]["media"] < 0.6
    assert abs(fl["stats"]["area_ha"] - 0.223) < 0.01
    assert client.get(f"/vuelos/{fl['id']}/ndvi.png", headers=h).headers["content-type"] == "image/png"
    assert client.get(f"/vuelos/{fl['id']}/ndvi.tif", headers=h).status_code == 200

    # Historial del lote
    hist = client.get(f"/lotes/{lote['id']}/vuelos", headers=h).json()
    assert len(hist) == 3
    assert client.get(f"/lotes/{lote['id']}", headers=h).json()["flights_count"] == 3

    # Validación de dosis
    bad = client.post(f"/vuelos/{fl['id']}/prescripciones", headers=h,
                      json={"num_zones": 3, "doses": [100, 90]})
    assert bad.status_code == 422

    # Prescripción
    r = client.post(f"/vuelos/{fl['id']}/prescripciones", headers=h, json={
        "name": "Urea V6", "product": "Urea", "unit": "kg/ha", "num_zones": 3,
        "method": "cuantiles", "doses": [150, 120, 90], "min_area_m2": 5,
    })
    assert r.status_code == 202, r.text
    rx = client.get(f"/prescripciones/{r.json()['id']}", headers=h).json()
    assert rx["status"] == "listo", rx
    s = rx["summary"]
    assert [z["dosis"] for z in s["zonas"]] == [150, 120, 90]
    assert abs(sum(z["area_ha"] for z in s["zonas"]) - s["area_total_ha"]) < 1e-6
    assert abs(s["producto_total"] - sum(z["dosis"] * z["area_ha"] for z in s["zonas"])) < 0.1

    # ZIP para el Agras
    z = client.get(f"/prescripciones/{rx['id']}/descargar", headers=h)
    assert z.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(z.content))
    names = set(zf.namelist())
    for need in ("DJI/Rx/prescripcion.tif", "DJI/Rx/prescripcion.tfw", "DJI/Shapefile/limite.shp",
                 "DJI/Shapefile/limite.prj", "zonas/zonas.shp", "zonas/zonas.geojson", "LEEME.txt"):
        assert need in names, need
    out = tmp_path / "rx.tif"
    out.write_bytes(zf.read("DJI/Rx/prescripcion.tif"))
    with rasterio.open(out) as ds:
        assert ds.crs.to_epsg() == 4326
        assert set(np.unique(ds.read(1)).tolist()) == {0.0, 90.0, 120.0, 150.0}

    gj = client.get(f"/prescripciones/{rx['id']}/zonas.geojson", headers=h).json()
    assert len(gj["features"]) == 3
    assert client.get(f"/prescripciones/{rx['id']}/zonas.png", headers=h).status_code == 200

    # Informe PDF
    pdf = client.get(f"/prescripciones/{rx['id']}/informe.pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    (tmp_path.parent / "informe_muestra.pdf").write_bytes(pdf.content)

    # Otro usuario no ve nada de esto
    _, code2 = _new_active_user(client, admin_h, "intruso", "intruso@campo.cl")
    client.post("/auth/activar", json={"code": code2})
    h2 = login(client, "intruso", "clave-larga-1")
    assert client.get(f"/lotes/{lote['id']}", headers=h2).status_code == 404
    assert client.get(f"/prescripciones/{rx['id']}/descargar", headers=h2).status_code == 404

    # Borrado en cascada
    assert client.delete(f"/lotes/{lote['id']}", headers=h).status_code == 204
    assert client.get(f"/prescripciones/{rx['id']}", headers=h).status_code == 404


def test_modo_ndvi_e_intervalos(client, tmp_path):
    admin_h = login(client, "admin", "admin-clave-segura")
    _, code = _new_active_user(client, admin_h, "luis", "luis@campo.cl")
    client.post("/auth/activar", json={"code": code})
    h = login(client, "luis", "clave-larga-1")
    lote = client.post("/lotes", json={"name": "Lote Sur"}, headers=h).json()
    src = make_ndvi(tmp_path / "ndvi.tif")
    with open(src, "rb") as f:
        r = client.post(f"/lotes/{lote['id']}/vuelos", headers=h,
                        files={"archivo": ("ndvi.tif", f, "image/tiff")}, data={"modo": "ndvi"})
    fl = client.get(f"/vuelos/{r.json()['id']}", headers=h).json()
    assert fl["status"] == "listo", fl
    r = client.post(f"/vuelos/{fl['id']}/prescripciones", headers=h, json={
        "num_zones": 4, "method": "intervalos", "doses": [0, 10, 20, 30], "unit": "L/ha"})
    rx = client.get(f"/prescripciones/{r.json()['id']}", headers=h).json()
    assert rx["status"] == "listo", rx
    assert len(rx["summary"]["zonas"]) == 4
    assert client.get(f"/prescripciones/{rx['id']}/informe.pdf", headers=h).status_code == 200
