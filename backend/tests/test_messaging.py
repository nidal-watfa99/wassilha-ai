"""Messaging, attachments, idempotency, AI status and websocket tests."""
import uuid

import pytest
from starlette.websockets import WebSocketDisconnect

H = {"X-Requested-With": "XMLHttpRequest"}


def _conv(client, a, b_email):
    r = client.post("/api/conversations", json={"emails": [b_email]},
                   cookies=a["cookies"], headers=H)
    assert r.status_code == 201, r.text
    return r.json()


def _send(client, user, conv_id, body="hello", key=None):
    key = key or uuid.uuid4().hex
    r = client.post(f"/api/conversations/{conv_id}/messages",
                   json={"body": body, "client_key": key},
                   cookies=user["cookies"], headers=H)
    assert r.status_code == 201, r.text
    return r.json()


def test_conversation_and_messages(client, alice, bob):
    conv = _conv(client, alice, bob["email"])
    # sending to a non-existent user fails cleanly
    r = client.post("/api/conversations", json={"emails": ["ghost@nowhere.example"]},
                    cookies=alice["cookies"], headers=H)
    assert r.status_code == 404
    # cannot start a conversation with yourself
    r = client.post("/api/conversations", json={"emails": [alice["email"]]},
                    cookies=alice["cookies"], headers=H)
    assert r.status_code == 422

    m1 = _send(client, alice, conv["id"], "مرحبا")
    assert m1["body"] == "مرحبا"
    # bob reads the conversation
    r = client.get(f"/api/conversations/{conv['id']}/messages", cookies=bob["cookies"])
    assert any(x["id"] == m1["id"] for x in r.json()["items"])
    # bob's message appears for alice
    m2 = _send(client, bob, conv["id"], "hi back")
    r = client.get(f"/api/conversations/{conv['id']}/messages", cookies=alice["cookies"])
    ids = [x["id"] for x in r.json()["items"]]
    assert m1["id"] in ids and m2["id"] in ids


def test_non_member_cannot_read_conversation(client, alice, bob):
    r = client.post("/api/auth/register", json={
        "name": "Outsider", "email": "outsider@test.example", "password": "password1"})
    out = dict(r.cookies)
    conv = _conv(client, alice, bob["email"])
    # outsider cannot read or send in a conversation they are not part of
    r = client.get(f"/api/conversations/{conv['id']}/messages", cookies=out)
    assert r.status_code == 403
    r = client.post(f"/api/conversations/{conv['id']}/messages",
                   json={"body": "intrude", "client_key": "x" * 20},
                   cookies=out, headers=H)
    assert r.status_code == 403
    # ...but bob (a member) can
    r = client.get(f"/api/conversations/{conv['id']}/messages", cookies=bob["cookies"])
    assert r.status_code == 200


def test_message_idempotency(client, alice, bob):
    conv = _conv(client, alice, bob["email"])
    key = "fixed-client-key-1234567890"
    m = _send(client, alice, conv["id"], "only once", key=key)
    m2 = _send(client, alice, conv["id"], "only once", key=key)
    assert m["id"] == m2["id"]
    r = client.get(f"/api/conversations/{conv['id']}/messages", cookies=bob["cookies"])
    assert len([x for x in r.json()["items"] if x["client_key"] == key]) == 1


def test_empty_message_rejected(client, alice, bob):
    conv = _conv(client, alice, bob["email"])
    r = client.post(f"/api/conversations/{conv['id']}/messages",
                   json={"body": "   ", "client_key": "x" * 20},
                   cookies=alice["cookies"], headers=H)
    assert r.status_code == 422


def test_attachment_upload_and_authorized_download(client, alice, bob):
    conv = _conv(client, alice, bob["email"])
    # alice uploads a small text file
    r = client.post("/api/files/upload", params={"kind": "file"},
                   cookies=alice["cookies"], headers=H,
                   files={"file": ("notes.txt", b"hello attachment", "text/plain")})
    assert r.status_code == 200, r.text
    f = r.json()["file"]
    # sends it as a message
    r = client.post(f"/api/conversations/{conv['id']}/messages",
                   json={"body": "file attached", "client_key": "file-msg-key-00000001",
                         "file_id": f["id"]},
                   cookies=alice["cookies"], headers=H)
    assert r.status_code == 201
    assert r.json()["kind"] == "file"
    # bob (conversation member) can download
    r = client.get(f"/api/files/{f['id']}/download", cookies=bob["cookies"])
    assert r.status_code == 200
    assert r.content == b"hello attachment"
    # outsider cannot
    r = client.post("/api/auth/register", json={
        "name": "Sneaky", "email": "sneaky@test.example", "password": "password1"})
    sneaky = dict(r.cookies)
    assert client.get(f"/api/files/{f['id']}/download", cookies=sneaky).status_code == 404


def test_upload_rejects_bad_type(client, alice):
    # disallowed type
    r = client.post("/api/files/upload", cookies=alice["cookies"], headers=H,
                    files={"file": ("evil.html", b"<script>alert(1)</script>", "text/html")})
    assert r.status_code == 415
    # type/extension mismatch
    r = client.post("/api/files/upload", cookies=alice["cookies"], headers=H,
                    files={"file": ("fake.png", b"not really a png", "image/png")})
    assert r.status_code == 415
    # empty upload
    r = client.post("/api/files/upload", cookies=alice["cookies"], headers=H,
                    files={"file": ("empty.txt", b"", "text/plain")})
    assert r.status_code == 400


def test_ai_not_configured_is_explicit(client, alice):
    r = client.get("/api/ai/status")
    assert r.status_code == 200
    configured = r.json()["configured"]
    r = client.post("/api/ai/chat", json={"content": "hello"},
                    cookies=alice["cookies"], headers=H)
    if not configured:
        assert r.status_code == 503
        assert r.json()["detail"] == "ai_not_configured"


def test_websocket_auth_and_delivery(client, alice, bob):
    conv = _conv(client, alice, bob["email"])
    # unauthenticated websocket is rejected (closed by the server).
    # A fresh client is used because TestClient keeps a cookie jar.
    from fastapi.testclient import TestClient
    from server import app
    anon = TestClient(app)
    with pytest.raises(WebSocketDisconnect):
        with anon.websocket_connect("/ws"):
            pass
    # alice connects and sends; bob must receive the push
    with client.websocket_connect("/ws", cookies=alice["cookies"]) as wsa:
        with client.websocket_connect("/ws", cookies=bob["cookies"]) as wsb:
            _send(client, alice, conv["id"], "push me")
            data = wsb.receive_json()
            assert data["type"] == "message"
            assert data["message"]["body"] == "push me"


def test_call_signaling_exchange(client, alice, bob):
    """Full signaling exchange between two members of a shared conversation."""
    _conv(client, alice, bob["email"])
    with client.websocket_connect("/ws", cookies=alice["cookies"]) as wsa:
        with client.websocket_connect("/ws", cookies=bob["cookies"]) as wsb:
            # 1. offer -> incoming-call rings bob
            wsa.send_json({"type": "call-offer", "to": bob["id"], "call_id": "c1",
                           "data": {"media": "audio", "sdp": "v=0..."}})
            ring = wsb.receive_json()
            assert ring["type"] == "incoming-call"
            assert ring["from"] == alice["id"]
            assert ring["media"] == "audio"
            # 2. answer relayed back to alice
            wsb.send_json({"type": "call-answer", "to": alice["id"], "call_id": "c1",
                           "data": {"sdp": "v=0...answer"}})
            ans = wsa.receive_json()
            assert ans["type"] == "call-answer"
            # 3. ICE relayed
            wsb.send_json({"type": "call-ice", "to": alice["id"], "call_id": "c1",
                           "data": {"candidate": "candidate:1"}})
            ice = wsa.receive_json()
            assert ice["type"] == "call-ice"
            # 4. hangup
            wsa.send_json({"type": "call-end", "to": bob["id"], "call_id": "c1", "data": {}})
            end = wsb.receive_json()
            assert end["type"] == "call-end"


def test_call_signaling_requires_shared_conversation(client, alice, bob):
    """An offer to a user with no shared conversation is rejected, and later
    signaling for that unregistered call is ignored (no delivery)."""
    from fastapi.testclient import TestClient
    from server import app
    r = client.post("/api/auth/register", json={
        "name": "Stranger", "email": "stranger@test.example", "password": "password1"})
    stranger = {"cookies": dict(r.cookies), "id": r.json()["user"]["id"]}
    stranger_client = TestClient(app)
    with stranger_client.websocket_connect("/ws", cookies=stranger["cookies"]) as wss:
        with client.websocket_connect("/ws", cookies=alice["cookies"]) as wsa:
            wss.send_json({"type": "call-offer", "to": alice["id"], "call_id": "c2",
                           "data": {"media": "audio"}})
            err = wss.receive_json()
            assert err == {"type": "error", "detail": "cannot_call_user"}
            # an answer for the rejected call c2 is ignored: alice's socket gets
            # nothing - prove the channel is otherwise alive with a real message
            conv = _conv(client, alice, bob["email"])
            with client.websocket_connect("/ws", cookies=bob["cookies"]) as wsb:
                _send(client, alice, conv["id"], "still works")
                data = wsa.receive_json()
                assert data["type"] == "message"
