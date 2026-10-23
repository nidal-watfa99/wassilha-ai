"""Shared test fixtures: fresh DB per session, two test users, CSRF header."""
import os
import tempfile

os.environ.setdefault("JWT_SECRET", "test-secret-key-that-is-long-enough-1234")
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="wassilha-uploads-")
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp(prefix='wassilha-db-')}/test.db"

import pytest
from fastapi.testclient import TestClient

import models.session as session_mod
from server import app


@pytest.fixture(scope="session")
def client():
    session_mod.engine.dispose()
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def users(client):
    """Two independent registered accounts with cookies set."""
    alice = {"name": "Alice", "email": "alice@test.example", "password": "password1", "locale": "ar"}
    bob = {"name": "Bob", "email": "bob@test.example", "password": "password2", "locale": "en"}
    for u in (alice, bob):
        r = client.post("/api/auth/register", json=u)
        assert r.status_code in (200, 201), r.text
        u["cookies"] = dict(r.cookies)
        u["id"] = r.json()["user"]["id"]
    return {"alice": alice, "bob": bob}


@pytest.fixture
def alice(users):
    return users["alice"]


@pytest.fixture
def bob(users):
    return users["bob"]
