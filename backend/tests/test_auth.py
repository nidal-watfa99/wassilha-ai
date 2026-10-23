"""Authentication, sessions, CSRF and rate-limit tests."""
import io


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_after_login(client, alice):
    r = client.get("/api/auth/me", cookies=alice["cookies"])
    assert r.status_code == 200
    assert r.json()["email"] == alice["email"]


def test_wrong_password(client, alice):
    r = client.post("/api/auth/login", json={
        "email": alice["email"], "password": "definitely-wrong"})
    assert r.status_code == 401
    assert r.json()["detail"] == "invalid_credentials"


def test_unknown_email_same_error(client):
    r = client.post("/api/auth/login", json={
        "email": "ghost@nowhere.example", "password": "whatever1"})
    assert r.status_code == 401
    assert r.json()["detail"] == "invalid_credentials"


def test_duplicate_email_rejected(client, alice):
    r = client.post("/api/auth/register", json={
        "name": "Clone", "email": alice["email"], "password": "password1"})
    assert r.status_code == 409


def test_short_password_rejected(client):
    r = client.post("/api/auth/register", json={
        "name": "Short", "email": "shortpw@test.example", "password": "short"})
    assert r.status_code == 422


def test_csrf_header_required(client, alice):
    r = client.post("/api/contacts", json={"name": "X"}, cookies=alice["cookies"])
    assert r.status_code == 403
    assert r.json()["detail"] == "csrf_header_required"


def test_logout_invalidates_session(client):
    r = client.post("/api/auth/register", json={
        "name": "Logout Tester", "email": "logout@test.example", "password": "password1"})
    cookies = dict(r.cookies)
    assert client.get("/api/auth/me", cookies=cookies).status_code == 200
    client.post("/api/auth/logout", cookies=cookies)
    assert client.get("/api/auth/me", cookies=cookies).status_code == 401


def test_change_password_flow(client):
    r = client.post("/api/auth/register", json={
        "name": "Pw Changer", "email": "pwchange@test.example", "password": "oldpassword"})
    cookies = dict(r.cookies)
    # wrong current password
    r = client.put("/api/auth/password", cookies=cookies, headers={"X-Requested-With": "XMLHttpRequest"}, json={
        "current_password": "nope", "new_password": "newpassword1"})
    assert r.status_code == 400
    # correct flow
    r = client.put("/api/auth/password", cookies=cookies, headers={"X-Requested-With": "XMLHttpRequest"}, json={
        "current_password": "oldpassword", "new_password": "newpassword1"})
    assert r.status_code == 200
    # old password no longer works
    r = client.post("/api/auth/login", json={
        "email": "pwchange@test.example", "password": "oldpassword"})
    assert r.status_code == 401
    r = client.post("/api/auth/login", json={
        "email": "pwchange@test.example", "password": "newpassword1"})
    assert r.status_code == 200


def test_profile_update(client, alice):
    r = client.patch("/api/auth/me", cookies=alice["cookies"],
                     headers={"X-Requested-With": "XMLHttpRequest"},
                     json={"name": "Alice Updated", "locale": "es"})
    assert r.status_code == 200
    assert r.json()["name"] == "Alice Updated"
    assert r.json()["locale"] == "es"
    # restore
    client.patch("/api/auth/me", cookies=alice["cookies"],
                 headers={"X-Requested-With": "XMLHttpRequest"},
                 json={"name": "Alice", "locale": "ar"})
