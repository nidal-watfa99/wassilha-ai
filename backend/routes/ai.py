"""AI assistant routes. Server-side provider integration only."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import get_db
from models.db import AIConversation, AIMessage, User
from services import ai as ai_service
from services.security import current_user, rate_limit

log = logging.getLogger("wassilha.ai")
router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatIn(BaseModel):
    conversation_id: str | None = None
    content: str = Field(min_length=1, max_length=8000)


def _conv_out(db: Session, c: AIConversation, with_messages: bool = False) -> dict:
    out = {"id": c.id, "title": c.title, "created_at": c.created_at.isoformat()}
    if with_messages:
        msgs = db.execute(
            select(AIMessage).where(AIMessage.conversation_id == c.id)
            .order_by(AIMessage.created_at)
        ).scalars().all()
        out["messages"] = [
            {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
            for m in msgs
        ]
    return out


def _owned(db: Session, user: User, conv_id: str) -> AIConversation:
    c = db.get(AIConversation, conv_id)
    if not c or c.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="conversation_not_found")
    return c


@router.get("/status")
def ai_status():
    return {"configured": ai_service.is_configured()}


@router.get("/conversations")
def list_conversations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(AIConversation).where(AIConversation.owner_id == user.id)
        .order_by(AIConversation.created_at.desc())
    ).scalars().all()
    return {"items": [{"id": c.id, "title": c.title or "…", "created_at": c.created_at.isoformat()} for c in rows]}


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _conv_out(db, _owned(db, user, conv_id), with_messages=True)


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned(db, user, conv_id)
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/chat")
async def chat(body: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rate_limit(f"ai:{user.id}", limit=20, window_sec=60)
    conv = None
    if body.conversation_id:
        conv = _owned(db, user, body.conversation_id)
    else:
        conv = AIConversation(owner_id=user.id, title=body.content[:80])
        db.add(conv)
        db.flush()

    if not ai_service.is_configured():
        # Save the user's message so nothing is lost, then report clearly.
        db.add(AIMessage(conversation_id=conv.id, role="user", content=body.content))
        db.commit()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="ai_not_configured")

    history = db.execute(
        select(AIMessage).where(AIMessage.conversation_id == conv.id)
        .order_by(AIMessage.created_at)
    ).scalars().all()
    messages = [{"role": m.role, "content": m.content} for m in history[-20:]]
    messages.append({"role": "user", "content": body.content})

    try:
        answer = await ai_service.chat(messages)
    except ai_service.AINotConfigured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="ai_not_configured")
    except Exception as e:
        log.warning("AI provider error: %s", type(e).__name__)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="ai_provider_error")

    db.add(AIMessage(conversation_id=conv.id, role="user", content=body.content))
    reply = AIMessage(conversation_id=conv.id, role="assistant", content=answer)
    db.add(reply)
    db.commit()
    return {
        "conversation_id": conv.id,
        "reply": {"id": reply.id, "role": "assistant", "content": answer, "created_at": reply.created_at.isoformat()},
    }
