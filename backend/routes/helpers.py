"""Shared helpers for routes."""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from models.db import Conversation, ConversationMember


def get_or_404(db: Session, model, obj_id: str, detail: str = "not_found"):
    obj = db.get(model, obj_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=detail)
    return obj


def conversation_member_ids(db: Session, conversation_id: str) -> list[str]:
    rows = db.execute(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id
        )
    ).scalars().all()
    return list(rows)


def require_conversation_access(db: Session, user_id: str, conversation_id: str) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="conversation_not_found")
    member = db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="not_a_member")
    return conv, member
