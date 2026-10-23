"""Commerce module tests: product & payment CRUD, cross-account isolation, validation."""
H = {"X-Requested-With": "XMLHttpRequest"}


def _mk_product(client, user, name="Product", price=100.0, **kw):
    body = {"name": name, "price": price, **kw}
    r = client.post("/api/products", json=body, cookies=user["cookies"], headers=H)
    assert r.status_code == 201, r.text
    return r.json()


def test_product_crud_and_isolation(client, alice, bob):
    p = _mk_product(client, alice, "Alice Service", price=250.0)
    assert p["price"] == 250.0

    # alice sees it, bob does not
    r = client.get("/api/products", cookies=alice["cookies"])
    assert any(x["name"] == "Alice Service" for x in r.json()["items"])
    r = client.get("/api/products", cookies=bob["cookies"])
    assert not any(x["name"] == "Alice Service" for x in r.json()["items"])

    # bob cannot patch or delete alice's product by id
    r = client.patch(f"/api/products/{p['id']}", json={"price": 1.0}, cookies=bob["cookies"], headers=H)
    assert r.status_code == 404
    r = client.delete(f"/api/products/{p['id']}", cookies=bob["cookies"], headers=H)
    assert r.status_code == 404

    # alice can patch and delete her own
    r = client.patch(f"/api/products/{p['id']}", json={"price": 300.0}, cookies=alice["cookies"], headers=H)
    assert r.status_code == 200 and r.json()["price"] == 300.0
    r = client.delete(f"/api/products/{p['id']}", cookies=alice["cookies"], headers=H)
    assert r.status_code == 200
    r = client.get("/api/products", cookies=alice["cookies"])
    assert not any(x["name"] == "Alice Service" for x in r.json()["items"])


def test_product_validation(client, alice):
    # empty name rejected
    r = client.post("/api/products", json={"name": "", "price": 10}, cookies=alice["cookies"], headers=H)
    assert r.status_code == 422
    # negative price rejected
    r = client.post("/api/products", json={"name": "Bad", "price": -1}, cookies=alice["cookies"], headers=H)
    assert r.status_code == 422
    # price above cap rejected
    r = client.post("/api/products", json={"name": "Bad", "price": 20_000_000}, cookies=alice["cookies"], headers=H)
    assert r.status_code == 422


def test_payment_records_and_isolation(client, alice, bob):
    p = _mk_product(client, alice, "Paid Service", price=99.0)
    body = {"product_id": p["id"], "amount": 99.0, "currency": "USD", "note": "manual record"}
    r = client.post("/api/payments", json=body, cookies=alice["cookies"], headers=H)
    assert r.status_code == 201, r.text
    pay = r.json()
    assert pay["status"] == "recorded"  # bookkeeping record, not a processed transaction

    # alice sees it, bob does not
    r = client.get("/api/payments", cookies=alice["cookies"])
    assert any(x["id"] == pay["id"] for x in r.json()["items"])
    r = client.get("/api/payments", cookies=bob["cookies"])
    assert not any(x["id"] == pay["id"] for x in r.json()["items"])

    # bob cannot modify/delete alice's payment
    r = client.patch(f"/api/payments/{pay['id']}", json={"amount": 1.0}, cookies=bob["cookies"], headers=H)
    assert r.status_code == 404
    r = client.delete(f"/api/payments/{pay['id']}", cookies=bob["cookies"], headers=H)
    assert r.status_code == 404

    # alice can patch and delete her own
    r = client.patch(f"/api/payments/{pay['id']}", json={"amount": 120.0}, cookies=alice["cookies"], headers=H)
    assert r.status_code == 200 and r.json()["amount"] == 120.0
    r = client.delete(f"/api/payments/{pay['id']}", cookies=alice["cookies"], headers=H)
    assert r.status_code == 200


def test_payment_validation(client, alice, bob):
    # zero/negative amount rejected
    r = client.post("/api/payments", json={"amount": 0}, cookies=alice["cookies"], headers=H)
    assert r.status_code == 422
    # payment referencing bob's product is rejected for alice
    bp = _mk_product(client, bob, "Bob Product", price=5.0)
    r = client.post("/api/payments", json={"product_id": bp["id"], "amount": 5.0}, cookies=alice["cookies"], headers=H)
    assert r.status_code == 422
    # payment referencing a nonexistent product is rejected
    r = client.post("/api/payments", json={"product_id": "no-such-id", "amount": 5.0}, cookies=alice["cookies"], headers=H)
    assert r.status_code == 422


def test_preview_mode_visitor_session(client, monkeypatch):
    """X-Visitor-Id acts as a session when preview mode is on; ignored otherwise.

    The shared session-scoped TestClient carries earlier tests' cookies, so a
    clean client is used here to test header-only authentication."""
    from fastapi.testclient import TestClient
    from server import app

    c = TestClient(app)
    # Off by default: header ignored -> 401
    r = c.get("/api/auth/me", headers={"X-Visitor-Id": "abc123"})
    assert r.status_code == 401

    monkeypatch.setattr(__import__("config").settings, "preview_mode", True)
    me = c.get("/api/auth/me", headers={"X-Visitor-Id": "abc123"})
    assert me.status_code == 200
    assert me.json()["email"].startswith("visitor-abc123@")
    # Visitor got seeded demo data (real rows)
    tasks = c.get("/api/tasks", headers={"X-Visitor-Id": "abc123"})
    assert len(tasks.json()["items"]) >= 3
    # Same visitor -> same isolated account; another visitor -> different one
    me2 = c.get("/api/auth/me", headers={"X-Visitor-Id": "abc123"})
    assert me2.json()["id"] == me.json()["id"]
    other = c.get("/api/auth/me", headers={"X-Visitor-Id": "other"})
    assert other.json()["id"] != me.json()["id"]
