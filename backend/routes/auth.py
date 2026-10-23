"""Authentication and account management routes.

Sessions use an HttpOnly cookie (JWT inside). The token is never exposed to
frontend JavaScript, which protects it from XSS theft. CSRF is mitigated by
SameSite=Lax plus requiring the custom X-Requested-With header on mutations
(enforced app-wide by middleware in server.py).
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import get_db
from models.db import User
from services.security import (
    clear_session_cookie, create_token, current_user, hash_password,
    rate_limit, set_session_cookie, verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

PASSWORD_MIN = 8


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=128)
    locale: str = "ar"

    @field_validator("locale")
    @classmethod
    def locale_ok(cls, v: str) -> str:
        if v not in ("ar", "en", "es"):
            raise ValueError("unsupported_locale")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    locale: str | None = None

    @field_validator("locale")
    @classmethod
    def locale_ok(cls, v):
        if v is not None and v not in ("ar", "en", "es"):
            raise ValueError("unsupported_locale")
        return v


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=128)


def _user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "locale": u.locale}


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "?"


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limit(f"register:{_client_key(request)}", limit=10)
    existing = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email_taken")
    user = User(
        email=body.email.lower(),
        name=body.name.strip(),
        password_hash=hash_password(body.password),
        locale=body.locale,
    )
    db.add(user)
    db.commit()
    set_session_cookie(response, create_token(user.id))
    return {"user": _user_out(user)}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limit(f"login:{_client_key(request)}", limit=10)
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    # Same error for unknown email and wrong password (no user enumeration)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    set_session_cookie(response, create_token(user.id))
    return {"user": _user_out(user)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    clear_session_cookie(response, request, db)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return _user_out(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.name is not None:
        user.name = body.name.strip()
    if body.locale is not None:
        user.locale = body.locale
    db.commit()
    return _user_out(user)


@router.put("/password")
def change_password(body: PasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="wrong_current_password")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}
