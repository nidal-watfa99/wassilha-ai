"""Contact directory routes (owner-scoped CRUD)."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from models import get_db
from models.db import Contact, User
from services.security import current_user

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr | str = ""
    phone: str = Field(default="", max_length=50)
    company: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=5000)

    @field_validator("email")
    @classmethod
    def email_ok(cls, v):
        if v and "@" not in v:
            raise ValueError("invalid_email")
        return v


class ContactPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | str | None = None
    phone: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=5000)


def _out(c: Contact) -> dict:
    return {
        "id": c.id, "name": c.name, "email": c.email, "phone": c.phone,
        "company": c.company, "notes": c.notes,
        "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat(),
    }


def _owned(db: Session, user: User, contact_id: str) -> Contact:
    c = db.get(Contact, contact_id)
    if not c or c.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="contact_not_found")
    return c


@router.get("")
def list_contacts(
    q: str = "", sort: str = Query("name", pattern="^(name|created_at|updated_at)$"),
    user: User = Depends(current_user), db: Session = Depends(get_db),
):
    stmt = select(Contact).where(Contact.owner_id == user.id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            Contact.name.ilike(like), Contact.email.ilike(like),
            Contact.phone.ilike(like), Contact.company.ilike(like),
        ))
    col = {"name": Contact.name, "created_at": Contact.created_at, "updated_at": Contact.updated_at}[sort]
    rows = db.execute(stmt.order_by(col)).scalars().all()
    return {"items": [_out(c) for c in rows]}


@router.post("", status_code=201)
def create_contact(body: ContactIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = Contact(owner_id=user.id, **body.model_dump())
    db.add(c)
    db.commit()
    return _out(c)


@router.get("/{contact_id}")
def get_contact(contact_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(_owned(db, user, contact_id))


@router.patch("/{contact_id}")
def patch_contact(contact_id: str, body: ContactPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned(db, user, contact_id)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "email" in data and data["email"] and "@" not in data["email"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_email")
    for k, v in data.items():
        setattr(c, k, v)
    db.commit()
    return _out(c)


@router.delete("/{contact_id}")
def delete_contact(contact_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned(db, user, contact_id)
    db.delete(c)
    db.commit()
    return {"ok": True}
