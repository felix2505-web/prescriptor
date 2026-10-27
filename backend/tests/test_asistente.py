"""Pruebas del asistente con un cliente de Claude simulado (no gasta créditos ni requiere internet)."""
import json
from types import SimpleNamespace as NS

import pytest
from conftest import login
from synthetic import make_multiband
from test_flujo_completo import _new_active_user

from app.config import get_settings
from app.main import app
from app.routers.assistant import get_ai_client


def text(t):
    return NS(type="text", text=t)


def tool(id_, name, **inp):
    return NS(type="tool_use", id=id_, name=name, input=inp)


def resp(blocks, stop="end_turn"):
    return NS(content=blocks, stop_reason=stop, usage=NS(input_tokens=100, output_tokens=20,
                                                         cache_read_input_tokens=0, cache_creation_input_tokens=0))


class FakeClient:
    """Devuelve respuestas guionadas y guarda lo que recibió en cada llamada."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def create(self, **kw):
        self.calls.append(json.loads(json.dumps(kw, default=str)))
        step = self.script.pop(0)
        return step(kw) if callable(step) else step


@pytest.fixture
def use_client():
    def _set(fake):
        app.dependency_overrides[get_ai_client] = lambda: fake
        return fake
    yield _set
    app.dependency_overrides.pop(get_ai_client, None)


@pytest.fixture(scope="module")
def datos(client, tmp_path_factory):
    """Usuario con un lote, un vuelo procesado y una prescripción lista."""
    admin_h = login(client, "admin", "admin-clave-segura")
    _, code = _new_active_user(client, admin_h, "rosa", "rosa@campo.cl")
    client.post("/auth/activar", json={"code": code})
    h = login(client, "rosa", "clave-larga-1")
    lote = client.post("/lotes", json={"name": "Potrero El Bajo", "crop": "Trigo"}, headers=h).json()
    src = make_multiband(tmp_path_factory.mktemp("img") / "orto.tif")
    with open(src, "rb") as f:
        fl = client.post(f"/lotes/{lote['id']}/vuelos", headers=h, files={"archivo": ("orto.tif", f, "image/tiff")},
                         data={"modo": "multibanda", "banda_rojo": 2, "banda_nir": 4, "fecha_vuelo": "2026-10-15"}).json()
    rx = client.post(f"/vuelos/{fl['id']}/prescripciones", headers=h, json={
        "name": "Urea macolla", "product": "Urea", "unit": "kg/ha", "num_zones": 3, "doses": [140, 110, 80]}).json()
    assert client.get(f"/prescripciones/{rx['id']}", headers=h).json()["status"] == "listo"

    _, code2 = _new_active_user(client, admin_h, "otro", "otro@campo.cl")
    client.post("/auth/activar", json={"code": code2})
    h2 = login(client, "otro", "clave-larga-1")
    return {"h": h, "h2": h2, "lote": lote, "vuelo": fl, "rx": rx}


def test_sin_clave_responde_503(client, datos):
    app.dependency_overrides[get_ai_client] = lambda: None
    try:
        r = client.post("/asistente/consultar", headers=datos["h"], json={"mensaje": "hola"})
        assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]
        assert client.get("/asistente/estado", headers=datos["h"]).json()["activo"] is False
    finally:
        app.dependency_overrides.pop(get_ai_client, None)


def test_requiere_sesion(client):
    assert client.post("/asistente/consultar", json={"mensaje": "hola"}).status_code == 401


def test_usa_herramientas_con_datos_del_usuario(client, datos, use_client):
    rx_id = datos["rx"]["id"]
    fake = use_client(FakeClient([
        resp([text("Reviso tus lotes."), tool("t1", "listar_lotes")], stop="tool_use"),
        resp([tool("t2", "ver_prescripcion", prescripcion_id=rx_id)], stop="tool_use"),
        resp([text("Necesitas **31 kg** de urea en total.")]),
    ]))
    r = client.post("/asistente/consultar", headers=datos["h"], json={
        "mensaje": "¿Cuánta urea necesito para El Bajo?",
        "pantalla": "Potrero El Bajo   ·   Prescripción   Urea macolla\n\n" + "x" * 50_000,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["respuesta"] == "Necesitas **31 kg** de urea en total."
    assert body["usadas_hoy"] == 1 and body["limite_diario"] == get_settings().assistant_daily_limit

    first = fake.calls[0]
    assert first["model"] == get_settings().assistant_model
    assert {t["name"] for t in first["tools"]} == {"listar_lotes", "ver_lote", "ver_vuelo", "ver_prescripcion"}
    assert "Juan Pérez" in first["system"][0]["text"]  # nombre del usuario en el prompt
    content = first["messages"][-1]["content"]
    assert content[0]["text"].startswith("<pantalla>") and len(content[0]["text"]) < 12_100  # recortada
    assert content[1]["text"] == "¿Cuánta urea necesito para El Bajo?"

    # Resultado de listar_lotes: solo los lotes de este usuario
    res1 = fake.calls[1]["messages"][-1]["content"][0]
    lotes = json.loads(res1["content"])["lotes"]
    assert res1["is_error"] is False and [l["nombre"] for l in lotes] == ["Potrero El Bajo"]

    # Resultado de ver_prescripcion: dosis y zonas reales
    res2 = json.loads(fake.calls[2]["messages"][-1]["content"][0]["content"])
    assert res2["dosis_por_zona"] == [140, 110, 80] and res2["producto"] == "Urea"
    assert len(res2["detalle"]["zonas"]) == 3

    # Se guarda la conversación
    conv = client.get(f"/asistente/conversaciones/{body['conversacion_id']}", headers=datos["h"]).json()
    assert [m["rol"] for m in conv["mensajes"]] == ["user", "assistant"]
    assert conv["titulo"].startswith("¿Cuánta urea")


def test_continua_la_conversacion_con_historial(client, datos, use_client):
    fake = use_client(FakeClient([resp([text("Primera.")]), resp([text("Segunda.")])]))
    c1 = client.post("/asistente/consultar", headers=datos["h"], json={"mensaje": "Hola"}).json()
    client.post("/asistente/consultar", headers=datos["h"],
                json={"mensaje": "¿Y ahora?", "conversacion_id": c1["conversacion_id"]})
    msgs = fake.calls[1]["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "user"]
    assert msgs[0]["content"] == "Hola" and msgs[1]["content"] == "Primera."


def test_no_accede_a_datos_ajenos(client, datos, use_client):
    fake = use_client(FakeClient([
        resp([tool("t1", "ver_lote", lote_id=datos["lote"]["id"]),
              tool("t2", "ver_prescripcion", prescripcion_id=datos["rx"]["id"])], stop="tool_use"),
        resp([text("No tienes ese lote.")]),
    ]))
    r = client.post("/asistente/consultar", headers=datos["h2"], json={"mensaje": "Muéstrame el lote de Rosa"})
    assert r.status_code == 200
    results = fake.calls[1]["messages"][-1]["content"]
    assert all(x["is_error"] for x in results)
    assert "Potrero El Bajo" not in json.dumps(results)

    # Tampoco puede continuar conversaciones de otro usuario
    convs = client.get("/asistente/conversaciones", headers=datos["h"]).json()
    r = client.post("/asistente/consultar", headers=datos["h2"],
                    json={"mensaje": "x", "conversacion_id": convs[0]["id"]})
    assert r.status_code == 404


def test_limite_diario(client, datos, use_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_daily_limit", 2)
    use_client(FakeClient([resp([text("ok")])] * 5))
    h = datos["h2"]
    usadas = client.get("/asistente/estado", headers=h).json()["usadas_hoy"]
    for _ in range(max(0, 2 - usadas)):
        assert client.post("/asistente/consultar", headers=h, json={"mensaje": "hola"}).status_code == 200
    r = client.post("/asistente/consultar", headers=h, json={"mensaje": "una más"})
    assert r.status_code == 429 and "límite" in r.json()["detail"]


def test_error_de_api_se_explica(client, datos, use_client):
    class Boom(Exception):
        status_code = 401

    def fail(_):
        raise Boom("invalid x-api-key")

    use_client(FakeClient([fail]))
    r = client.post("/asistente/consultar", headers=datos["h"], json={"mensaje": "hola"})
    assert r.status_code == 502 and "clave" in r.json()["detail"]


def test_borrar_conversacion(client, datos, use_client):
    use_client(FakeClient([resp([text("ok")])]))
    c = client.post("/asistente/consultar", headers=datos["h"], json={"mensaje": "borrar"}).json()
    assert client.delete(f"/asistente/conversaciones/{c['conversacion_id']}", headers=datos["h"]).status_code == 204
    assert client.get(f"/asistente/conversaciones/{c['conversacion_id']}", headers=datos["h"]).status_code == 404
