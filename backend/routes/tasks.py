"""Tasks and calendar events routes (owner-scoped)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import get_db
from models.db import Event, Task, User
from services.security import current_user

router = APIRouter(prefix="/api", tags=["tasks"])


def _parse_dt(v: str) -> datetime:
    """Accept ISO datetimes; convert to naive UTC (storage format)."""
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except (ValueError, AttributeError, TypeError):
        raise ValueError("invalid_datetime")
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=5000)
    status: str = Field(default="todo", pattern="^(todo|doing|done)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    due_date: str | None = None

    @field_validator("due_date")
    @classmethod
    def due_ok(cls, v):
        if v is not None:
            _parse_dt(v)
        return v


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=5000)
    status: str | None = Field(default=None, pattern="^(todo|doing|done)$")
    priority: str | None = Field(default=None, pattern="^(low|medium|high)$")
    due_date: str | None = None
    clear_due: bool = False

    @field_validator("due_date")
    @classmethod
    def due_ok(cls, v):
        if v is not None:
            _parse_dt(v)  # raises ValueError -> 422
        return v


def _task_out(t: Task) -> dict:
    return {
        "id": t.id, "title": t.title, "notes": t.notes, "status": t.status,
        "priority": t.priority,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "created_at": t.created_at.isoformat(), "updated_at": t.updated_at.isoformat(),
    }


def _owned_task(db: Session, user: User, task_id: str) -> Task:
    t = db.get(Task, task_id)
    if not t or t.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="task_not_found")
    return t


# ---------- Tasks ----------

@router.get("/tasks")
def list_tasks(status: str | None = None, priority: str | None = None,
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Task).where(Task.owner_id == user.id)
    if status:
        stmt = stmt.where(Task.status == status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    rows = db.execute(stmt.order_by(Task.created_at.desc())).scalars().all()
    return {"items": [_task_out(t) for t in rows]}


@router.post("/tasks", status_code=201)
def create_task(body: TaskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = Task(
        owner_id=user.id, title=body.title.strip(), notes=body.notes,
        status=body.status, priority=body.priority,
        due_date=_parse_dt(body.due_date) if body.due_date else None,
    )
    db.add(t)
    db.commit()
    return _task_out(t)


@router.get("/tasks/{task_id}")
def get_task(task_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _task_out(_owned_task(db, user, task_id))


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, body: TaskPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = _owned_task(db, user, task_id)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "title" in data:
        t.title = data["title"].strip()
    for k in ("notes", "status", "priority"):
        if k in data:
            setattr(t, k, data[k])
    if body.clear_due:
        t.due_date = None
    elif body.due_date is not None:
        t.due_date = _parse_dt(body.due_date)
    db.commit()
    return _task_out(t)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = _owned_task(db, user, task_id)
    db.delete(t)
    db.commit()
    return {"ok": True}


# ---------- Events ----------

class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=5000)
    start_at: str
    end_at: str | None = None

    @field_validator("start_at", "end_at")
    @classmethod
    def dt_ok(cls, v):
        if v is not None:
            _parse_dt(v)
        return v


class EventPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=5000)
    start_at: str | None = None
    end_at: str | None = None

    @field_validator("start_at", "end_at")
    @classmethod
    def dt_ok(cls, v):
        if v is not None:
            _parse_dt(v)
        return v


def _event_out(e: Event) -> dict:
    return {
        "id": e.id, "title": e.title, "notes": e.notes,
        "start_at": e.start_at.isoformat(),
        "end_at": e.end_at.isoformat() if e.end_at else None,
        "created_at": e.created_at.isoformat(),
    }


def _owned_event(db: Session, user: User, event_id: str) -> Event:
    e = db.get(Event, event_id)
    if not e or e.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="event_not_found")
    return e


@router.get("/events")
def list_events(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Event).where(Event.owner_id == user.id).order_by(Event.start_at)
    ).scalars().all()
    return {"items": [_event_out(e) for e in rows]}


@router.post("/events", status_code=201)
def create_event(body: EventIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    start = _parse_dt(body.start_at)
    end = _parse_dt(body.end_at) if body.end_at else None
    if end and end < start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end_before_start")
    e = Event(owner_id=user.id, title=body.title.strip(), notes=body.notes, start_at=start, end_at=end)
    db.add(e)
    db.commit()
    return _event_out(e)


@router.patch("/events/{event_id}")
def patch_event(event_id: str, body: EventPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = _owned_event(db, user, event_id)
    if body.title is not None:
        e.title = body.title.strip()
    if body.notes is not None:
        e.notes = body.notes
    if body.start_at is not None:
        e.start_at = _parse_dt(body.start_at)
    if body.end_at is not None:
        e.end_at = _parse_dt(body.end_at)
    if e.end_at and e.start_at and e.end_at < e.start_at:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end_before_start")
    db.commit()
    return _event_out(e)


@router.delete("/events/{event_id}")
def delete_event(event_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = _owned_event(db, user, event_id)
    db.delete(e)
    db.commit()
    return {"ok": True}
