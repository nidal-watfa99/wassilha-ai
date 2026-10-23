"""Messaging: conversations, messages, attachments (files & voice notes).

Flow: messages are sent via authenticated HTTP (the server response is the
authoritative "accepted" signal), then pushed live to online members over
WebSocket. Attachments are uploaded first, then attached to a message send.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from models import get_db
from models.db import Conversation, ConversationMember, Message, StoredFile, User
from routes.helpers import conversation_member_ids, require_conversation_access
from services import files as files_service
from services.realtime import manager
from services.security import current_user

log = logging.getLogger("wassilha.messaging")

router = APIRouter(prefix="/api", tags=["messaging"])


def _msg_out(m: Message, files_by_msg: dict | None = None) -> dict:
    out = {
        "id": m.id, "conversation_id": m.conversation_id, "sender_id": m.sender_id,
        "body": m.body, "kind": m.kind, "client_key": m.client_key,
        "created_at": m.created_at.isoformat(),
    }
    f = (files_by_msg or {}).get(m.id)
    if f:
        out["attachment"] = {
            "file_id": f.id, "name": f.original_name, "size": f.size,
            "mime": f.mime_type, "kind": f.kind,
        }
    return out


def _file_out(f: StoredFile) -> dict:
    return {
        "id": f.id, "name": f.original_name, "size": f.size,
        "mime": f.mime_type, "kind": f.kind, "message_id": f.message_id,
    }


class ConversationIn(BaseModel):
    emails: list[EmailStr] = Field(min_length=1, max_length=50)
    title: str | None = Field(default=None, max_length=120)


class MessageIn(BaseModel):
    body: str = Field(default="", max_length=10000)
    client_key: str = Field(min_length=8, max_length=64)
    file_id: str | None = None


def _members_of(db: Session, conv_id: str) -> list[str]:
    return conversation_member_ids(db, conv_id)


def _conv_out(db: Session, conv: Conversation, user_id: str) -> dict:
    members = db.execute(
        select(User).join(ConversationMember, ConversationMember.user_id == User.id)
        .where(ConversationMember.conversation_id == conv.id)
    ).scalars().all()
    others = [u for u in members if u.id != user_id]
    last_msg = db.execute(
        select(Message).where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
    ).scalars().first()
    member = db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conv.id,
            ConversationMember.user_id == user_id,
        )
    ).scalar_one()
    unread = 0
    if last_msg and member.last_read_at:
        if last_msg.created_at > member.last_read_at and last_msg.sender_id != user_id:
            unread = 1
    elif last_msg and last_msg.sender_id != user_id and member.last_read_at is None:
        unread = 1
    return {
        "id": conv.id, "is_group": conv.is_group, "title": conv.title,
        "members": [{"id": u.id, "name": u.name, "email": u.email} for u in members],
        "display_name": conv.title or (", ".join(u.name for u in others) or "—"),
        "last_message": {
            "body": last_msg.body, "kind": last_msg.kind,
            "created_at": last_msg.created_at.isoformat(), "sender_id": last_msg.sender_id,
        } if last_msg else None,
        "unread": unread,
        "created_at": conv.created_at.isoformat(),
    }


@router.get("/conversations")
def list_conversations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    convs = db.execute(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == user.id)
        .order_by(Conversation.created_at)
    ).scalars().unique().all()
    return {"items": [_conv_out(db, c, user.id) for c in convs]}


@router.post("/conversations", status_code=201)
def create_conversation(body: ConversationIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target_emails = [e.lower() for e in body.emails]
    if user.email in target_emails:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="cannot_message_self")
    targets = db.execute(select(User).where(User.email.in_(target_emails))).scalars().all()
    found = {u.email for u in targets}
    missing = [e for e in target_emails if e not in found]
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user_not_found")

    member_ids = sorted([user.id] + [u.id for u in targets])

    if len(member_ids) == 2:
        # reuse existing 1:1 conversation between exactly these two users
        existing = db.execute(
            select(Conversation).where(Conversation.is_group == False)  # noqa: E712
        ).scalars().unique().all()
        for conv in existing:
            ids = sorted(_members_of(db, conv.id))
            if ids == member_ids:
                return _conv_out(db, conv, user.id)

    conv = Conversation(
        is_group=len(member_ids) > 2,
        title=body.title if (body.title and len(member_ids) > 2) else "",
    )
    db.add(conv)
    db.flush()
    for uid in member_ids:
        db.add(ConversationMember(conversation_id=conv.id, user_id=uid))
    db.commit()
    return _conv_out(db, conv, user.id)


@router.get("/conversations/{conv_id}/messages")
def list_messages(conv_id: str, limit: int = Query(50, le=200), before: str | None = None,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_conversation_access(db, user.id, conv_id)
    stmt = select(Message).where(Message.conversation_id == conv_id)
    if before:
        stmt = stmt.where(Message.created_at < datetime.fromisoformat(before.replace("Z", "+00:00")).replace(tzinfo=None))
    rows = db.execute(stmt.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit)).scalars().all()
    rows.reverse()
    file_rows = db.execute(select(StoredFile).where(StoredFile.message_id.in_([m.id for m in rows] or [""]))).scalars().all()
    by_msg = {f.message_id: f for f in file_rows}
    return {"items": [_msg_out(m, by_msg) for m in rows]}


@router.post("/conversations/{conv_id}/messages", status_code=201)
async def send_message(conv_id: str, body: MessageIn,
                       user: User = Depends(current_user), db: Session = Depends(get_db)):
    conv, member = require_conversation_access(db, user.id, conv_id)

    # Idempotency: a retried send with the same client_key returns the
    # original message instead of duplicating it.
    existing = db.execute(
        select(Message).where(
            Message.conversation_id == conv_id, Message.client_key == body.client_key
        )
    ).scalar_one_or_none()
    if existing:
        return _msg_out(existing)

    attachment = None
    if body.file_id:
        f = db.get(StoredFile, body.file_id)
        if not f or f.owner_id != user.id or f.message_id is not None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_file")
        attachment = f

    if not body.body.strip() and not attachment:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="empty_message")

    msg = Message(
        conversation_id=conv_id, sender_id=user.id,
        body=body.body.strip(), kind="text",
        client_key=body.client_key,
    )
    if attachment:
        msg.kind = attachment.kind  # "file" | "voice"
    db.add(msg)
    db.flush()

    if attachment:
        attachment.message_id = msg.id

    member.last_read_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()

    payload = {"type": "message", "conversation_id": conv_id, "message": _msg_out(msg, {msg.id: attachment} if attachment else {})}
    await manager.send_to_users(_members_of(db, conv_id), payload)
    return _msg_out(msg, {msg.id: attachment} if attachment else {})


@router.post("/conversations/{conv_id}/read")
def mark_read(conv_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _, member = require_conversation_access(db, user.id, conv_id)
    member.last_read_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"ok": True}


# ---------- Attachments ----------

class AttachOut(BaseModel):
    file: dict


@router.post("/files/upload")
async def upload_file(request: Request, kind: str = Query("file", pattern="^(file|voice)$"),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("multipart/form-data"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="expected_multipart")
    form = await request.form()
    upload = form.get("file")
    if upload is None or not hasattr(upload, "file"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="missing_file")
    max_mb = files_service.settings.max_voice_mb if kind == "voice" else files_service.settings.max_upload_mb
    data, safe_name, size = files_service.validate_upload(upload, max_mb)
    stored = files_service.store_file(data, upload.content_type.split(";")[0].strip().lower())
    f = StoredFile(
        owner_id=user.id, original_name=safe_name, stored_name=stored,
        mime_type=upload.content_type.split(";")[0].strip().lower(), size=size, kind=kind,
    )
    db.add(f)
    db.commit()
    return {"file": _file_out(f)}


def _authorized_file(db: Session, user: User, f: StoredFile) -> bool:
    if f.owner_id == user.id:
        return True
    if f.message_id:
        msg = db.get(Message, f.message_id)
        if msg:
            return user.id in conversation_member_ids(db, msg.conversation_id)
    return False


@router.get("/files/{file_id}/download")
def download_file(file_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = db.get(StoredFile, file_id)
    if not f or not _authorized_file(db, user, f):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="file_not_found")
    path = files_service.file_path(f.stored_name)
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, detail="file_gone")
    return FileResponse(path, media_type=f.mime_type, filename=f.original_name)


@router.get("/files/{file_id}/info")
def file_info(file_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = db.get(StoredFile, file_id)
    if not f or not _authorized_file(db, user, f):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="file_not_found")
    return _file_out(f)
