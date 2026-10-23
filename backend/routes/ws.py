"""WebSocket endpoint: live message updates + WebRTC call signaling.

Auth: the session cookie must be present on the handshake request (validated
against the DB) and the Origin header must match the configured allowlist.

Signaling sequence (JSON messages):
  Caller                          Callee
  ------                          ------
  call-offer  --------------->    incoming-call (ringing)
                                 (accept) -> call-answer
  call-ice <---------------->  call-ice (buffered until remote description)
  ... media flows (P2P WebRTC) ...
  call-end   --------------->    call-end (both sides clean up)

Every event is validated against the active-call registry: answers, ICE and
hangups are only relayed between the two registered participants of that
call_id. Offers additionally require a shared conversation.
"""
import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import settings
from models import get_db
from models.db import ConversationMember
from services.realtime import manager
from services.security import ws_user

log = logging.getLogger("wassilha.ws")
router = APIRouter()

# Active calls: call_id -> frozenset of the two participant ids
_active_calls: dict[str, frozenset[str]] = {}

_VALID_TYPES = ("call-offer", "call-answer", "call-ice", "call-end")


def _origin_allowed(origin: str | None) -> bool:
    if not origin:
        return True  # non-browser clients (mobile app, tests) send no Origin
    allowed = {o.strip().rstrip("/") for o in settings.cors_origins.split(",") if o.strip()}
    allowed = {o[:-1] if o.endswith("/") else o for o in allowed}
    if origin.rstrip("/") in allowed:
        return True
    if settings.preview_mode:
        # Sandboxed preview iframes send an opaque "null" origin; the hosting
        # proxy fronts the app on pplx domains. Preview mode only — never prod.
        return origin == "null" or origin.endswith(".pplx.app") or origin.endswith("perplexity.ai")
    return False


def _share_conversation(db: Session, a: str, b: str) -> bool:
    conv_a = set(db.execute(
        select(ConversationMember.conversation_id).where(ConversationMember.user_id == a)
    ).scalars().all())
    conv_b = set(db.execute(
        select(ConversationMember.conversation_id).where(ConversationMember.user_id == b)
    ).scalars().all())
    return bool(conv_a & conv_b)


async def _handle(db: Session, ws: WebSocket, user_id: str, payload: dict) -> None:
    ptype = payload.get("type")
    if ptype not in _VALID_TYPES:
        return
    to = str(payload.get("to") or "")
    call_id = str(payload.get("call_id") or "")
    if not to or not call_id:
        return

    if ptype == "call-offer":
        if not _share_conversation(db, user_id, to):
            await ws.send_json({"type": "error", "detail": "cannot_call_user"})
            return
        _active_calls[call_id] = frozenset({user_id, to})
        # ring the callee with the full offer payload (media + SDP) so they can
        # accept and answer directly
        data = dict(payload.get("data") or {})
        from models.db import User
        callee = db.get(User, to)
        await manager.send_to_user(to, {
            "type": "incoming-call", "from": user_id,
            "from_name": callee.name if callee else "?",
            "call_id": call_id, "media": data.get("media", "audio"),
            "sdp": data.get("sdp"),
        })
        return

    participants = _active_calls.get(call_id)
    if not participants or user_id not in participants or to not in participants:
        return  # not a call this user is part of - ignore silently

    if ptype == "call-end":
        _active_calls.pop(call_id, None)
    await manager.send_to_user(to, {
        "type": ptype, "from": user_id, "call_id": call_id, "data": payload.get("data"),
    })


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, db: Session = Depends(get_db)):
    origin = ws.headers.get("origin")
    if not _origin_allowed(origin):
        await ws.close(code=4403)
        return
    user = await ws_user(ws, db)
    if not user:
        await ws.close(code=4401)
        return
    user_id = user.id
    await manager.connect(user_id, ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                payload = json.loads(raw)
                if isinstance(payload, dict):
                    await _handle(db, ws, user_id, payload)
            except (ValueError, KeyError):
                continue
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, ws)
        # clean up any active calls involving this user
        for cid in [c for c, p in _active_calls.items() if user_id in p]:
            other = next(iter(_active_calls[cid] - {user_id}), None)
            _active_calls.pop(cid, None)
            if other:
                await manager.send_to_user(other, {"type": "call-end", "call_id": cid, "from": user_id})
        db.close()
