import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).parent))


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    data = tmp_path_factory.mktemp("data")
    os.environ.update({
        "DATABASE_URL": f"sqlite:///{data / 'test.db'}",
        "DATA_DIR": str(data),
        "ADMIN_USERNAME": "admin",
        "ADMIN_PASSWORD": "admin-clave-segura",
        "SECRET_KEY": "clave-de-pruebas-con-largo-suficiente-para-hs256",
        "SMTP_HOST": "",
    })
    from app.config import get_settings
    get_settings.cache_clear()
    from app.db import init_engine
    init_engine()
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c


def login(client, user, pwd) -> dict:
    r = client.post("/auth/login", data={"username": user, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
