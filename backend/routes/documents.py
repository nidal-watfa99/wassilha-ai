"""Documents: a reliable plain-text / Markdown editor backend."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import get_db
from models.db import Document, User
from services.security import current_user

router = APIRouter(prefix="/api/documents", tags=["documents"])


class DocumentIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=200_000)


class DocumentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=200_000)


def _out(d: Document) -> dict:
    return {
        "id": d.id, "title": d.title, "content": d.content,
        "created_at": d.created_at.isoformat(), "updated_at": d.updated_at.isoformat(),
    }


def _owned(db: Session, user: User, doc_id: str) -> Document:
    d = db.get(Document, doc_id)
    if not d or d.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="document_not_found")
    return d


@router.get("")
def list_documents(q: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Document).where(Document.owner_id == user.id)
    if q:
        stmt = stmt.where(Document.title.ilike(f"%{q}%"))
    rows = db.execute(stmt.order_by(Document.updated_at.desc())).scalars().all()
    return {"items": [{**_out(d), "content": d.content[:0]} for d in rows]}  # list view: metadata only


@router.post("", status_code=201)
def create_document(body: DocumentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = Document(owner_id=user.id, title=body.title.strip(), content=body.content)
    db.add(d)
    db.commit()
    return _out(d)


@router.get("/{doc_id}")
def get_document(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(_owned(db, user, doc_id))


@router.patch("/{doc_id}")
def patch_document(doc_id: str, body: DocumentPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = _owned(db, user, doc_id)
    if body.title is not None:
        d.title = body.title.strip()
    if body.content is not None:
        d.content = body.content
    db.commit()
    return _out(d)


@router.delete("/{doc_id}")
def delete_document(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = _owned(db, user, doc_id)
    db.delete(d)
    db.commit()
    return {"ok": True}
