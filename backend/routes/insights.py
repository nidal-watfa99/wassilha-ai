"""Dashboard summary and insights - computed from the user's real data only.

No invented metrics: empty accounts produce zeros and the frontend shows
meaningful empty states.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import get_db
from models.db import (
    AIConversation, Contact, Conversation, ConversationMember, Document, Event,
    Message, Payment, Task, User,
)
from services.security import current_user

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    uid = user.id

    def count(model, *where):
        return db.execute(select(func.count()).select_from(model).where(*where)).scalar() or 0

    conv_ids = select(ConversationMember.conversation_id).where(ConversationMember.user_id == uid)
    messages_sent = db.execute(
        select(func.count()).select_from(Message).where(
            Message.sender_id == uid, Message.conversation_id.in_(conv_ids)
        )
    ).scalar() or 0

    recent_convs = db.execute(
        select(Conversation).where(Conversation.id.in_(conv_ids))
        .order_by(Conversation.created_at.desc()).limit(5)
    ).scalars().all()
    recent = []
    for c in recent_convs:
        last = db.execute(
            select(Message).where(Message.conversation_id == c.id)
            .order_by(Message.created_at.desc()).limit(1)
        ).scalars().first()
        # Display name mirrors the messaging module: group title, or the
        # other participants' names for direct conversations.
        other_names = db.execute(
            select(User.name)
            .join(ConversationMember, ConversationMember.user_id == User.id)
            .where(ConversationMember.conversation_id == c.id, User.id != uid)
        ).scalars().all()
        title = c.title or (", ".join(other_names) if other_names else "")
        recent.append({
            "id": c.id, "title": title, "is_group": c.is_group,
            "last_body": last.body if last else "", "last_at": last.created_at.isoformat() if last else None,
        })

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upcoming_events = db.execute(
        select(Event).where(Event.owner_id == uid, Event.start_at >= now)
        .order_by(Event.start_at).limit(5)
    ).scalars().all()

    return {
        "counts": {
            "contacts": count(Contact, Contact.owner_id == uid),
            "tasks_open": count(Task, Task.owner_id == uid, Task.status != "done"),
            "tasks_done": count(Task, Task.owner_id == uid, Task.status == "done"),
            "documents": count(Document, Document.owner_id == uid),
            "conversations": len(db.execute(conv_ids).scalars().all()),
            "messages_sent": messages_sent,
            "ai_conversations": count(AIConversation, AIConversation.owner_id == uid),
        },
        "recent_conversations": recent,
        "upcoming_events": [
            {"id": e.id, "title": e.title, "start_at": e.start_at.isoformat()} for e in upcoming_events
        ],
    }


@router.get("/insights")
def insights(user: User = Depends(current_user), db: Session = Depends(get_db)):
    uid = user.id
    tasks = db.execute(select(Task).where(Task.owner_id == uid)).scalars().all()
    by_status = {"todo": 0, "doing": 0, "done": 0}
    by_priority = {"low": 0, "medium": 0, "high": 0}
    for t in tasks:
        by_status[t.status] = by_status.get(t.status, 0) + 1
        by_priority[t.priority] = by_priority.get(t.priority, 0) + 1

    conv_ids = select(ConversationMember.conversation_id).where(ConversationMember.user_id == uid)
    messages = db.execute(
        select(Message).where(Message.conversation_id.in_(conv_ids))
        .order_by(Message.created_at.desc()).limit(500)
    ).scalars().all()
    # messages per weekday (0=Monday) over the most recent 500 messages
    per_weekday = [0] * 7
    for m in messages:
        per_weekday[m.created_at.weekday()] += 1

    payments = db.execute(select(Payment).where(Payment.owner_id == uid)).scalars().all()
    totals: dict[str, float] = {}
    for p in payments:
        totals[p.currency] = round(totals.get(p.currency, 0.0) + p.amount, 2)

    return {
        "tasks": {"by_status": by_status, "by_priority": by_priority},
        "messages": {
            "recent_count": len(messages),
            "per_weekday": per_weekday,
        },
        "payments_total": totals,
        "sample_sizes": {"tasks": len(tasks), "payments": len(payments)},
    }
