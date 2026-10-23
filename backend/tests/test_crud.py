"""CRUD + cross-account isolation tests for contacts, tasks, documents, events."""
H = {"X-Requested-With": "XMLHttpRequest"}


def _mk_contact(client, user, name="Contact", **kw):
    body = {"name": name, "email": kw.get("email", ""), "phone": kw.get("phone", "")}
    r = client.post("/api/contacts", json=body, cookies=user["cookies"], headers=H)
    assert r.status_code == 201, r.text
    return r.json()


def _mk_task(client, user, title="Task", **kw):
    body = {"title": title, **kw}
    r = client.post("/api/tasks", json=body, cookies=user["cookies"], headers=H)
    assert r.status_code == 201, r.text
    return r.json()


def test_contact_crud_and_isolation(client, alice, bob):
    c = _mk_contact(client, alice, "Alice's Contact", email="a@x.example")
    # alice sees it
    r = client.get("/api/contacts", cookies=alice["cookies"])
    assert any(x["name"] == "Alice's Contact" for x in r.json()["items"])
    # bob does NOT see it and cannot fetch it by id
    r = client.get("/api/contacts", cookies=bob["cookies"])
    assert not any(x["name"] == "Alice's Contact" for x in r.json()["items"])
    r = client.get(f"/api/contacts/{c['id']}", cookies=bob["cookies"])
    assert r.status_code == 404
    r = client.delete(f"/api/contacts/{c['id']}", cookies=bob["cookies"], headers=H)
    assert r.status_code == 404
    # search
    r = client.get("/api/contacts", params={"q": "Alice's"}, cookies=alice["cookies"])
    assert len(r.json()["items"]) == 1
    # patch
    r = client.patch(f"/api/contacts/{c['id']}", json={"phone": "+1234567890"},
                     cookies=alice["cookies"], headers=H)
    assert r.json()["phone"] == "+1234567890"
    # delete
    r = client.delete(f"/api/contacts/{c['id']}", cookies=alice["cookies"], headers=H)
    assert r.status_code == 200


def test_contact_invalid_email(client, alice):
    r = client.post("/api/contacts", json={"name": "Bad", "email": "not-an-email"},
                    cookies=alice["cookies"], headers=H)
    assert r.status_code == 422


def test_task_crud_and_isolation(client, alice, bob):
    t = _mk_task(client, alice, "Write tests", priority="high", due_date="2026-12-01T10:00:00Z")
    assert t["status"] == "todo"
    # bob cannot see or modify
    assert client.get(f"/api/tasks/{t['id']}", cookies=bob["cookies"]).status_code == 404
    r = client.patch(f"/api/tasks/{t['id']}", json={"status": "done"},
                     cookies=bob["cookies"], headers=H)
    assert r.status_code == 404
    # alice updates status
    r = client.patch(f"/api/tasks/{t['id']}", json={"status": "done"},
                     cookies=alice["cookies"], headers=H)
    assert r.json()["status"] == "done"
    # filter
    r = client.get("/api/tasks", params={"status": "done"}, cookies=alice["cookies"])
    assert any(x["id"] == t["id"] for x in r.json()["items"])
    # delete
    assert client.delete(f"/api/tasks/{t['id']}", cookies=alice["cookies"], headers=H).status_code == 200


def test_task_invalid_status(client, alice):
    r = client.post("/api/tasks", json={"title": "T", "status": "bogus"},
                    cookies=alice["cookies"], headers=H)
    assert r.status_code == 422


def test_document_crud_and_isolation(client, alice, bob):
    r = client.post("/api/documents", json={"title": "Spec", "content": "# hello"},
                    cookies=alice["cookies"], headers=H)
    assert r.status_code == 201
    doc = r.json()
    # bob denied
    assert client.get(f"/api/documents/{doc['id']}", cookies=bob["cookies"]).status_code == 404
    # alice edits
    r = client.patch(f"/api/documents/{doc['id']}", json={"content": "# updated"},
                     cookies=alice["cookies"], headers=H)
    assert r.json()["content"] == "# updated"
    # search by title
    r = client.get("/api/documents", params={"q": "Spec"}, cookies=alice["cookies"])
    assert len(r.json()["items"]) == 1
    assert client.delete(f"/api/documents/{doc['id']}", cookies=alice["cookies"], headers=H).status_code == 200


def test_event_crud_and_validation(client, alice):
    r = client.post("/api/events", json={"title": "Standup", "start_at": "2026-11-01T09:00:00Z"},
                    cookies=alice["cookies"], headers=H)
    assert r.status_code == 201
    e = r.json()
    # end before start rejected
    r = client.post("/api/events", json={
        "title": "Bad", "start_at": "2026-11-02T09:00:00Z", "end_at": "2026-11-02T08:00:00Z"},
        cookies=alice["cookies"], headers=H)
    assert r.status_code == 422
    # list
    r = client.get("/api/events", cookies=alice["cookies"])
    assert any(x["id"] == e["id"] for x in r.json()["items"])
    assert client.delete(f"/api/events/{e['id']}", cookies=alice["cookies"], headers=H).status_code == 200


def test_dashboard_reflects_real_data(client, alice, bob):
    _mk_task(client, alice, "Dashboard task")
    r = client.get("/api/dashboard", cookies=alice["cookies"])
    data = r.json()
    assert data["counts"]["tasks_open"] >= 1
    # bob's dashboard does not include alice's data
    r = client.get("/api/dashboard", cookies=bob["cookies"])
    counts_bob = r.json()["counts"]
    assert counts_bob["contacts"] == 0
