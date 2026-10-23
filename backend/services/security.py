"""Authentication, password hashing, JWT cookies and rate limiting."""
import time
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from config import settings
from models import get_db
from models.db import User

hasher = PasswordHasher()

# Revoked JWT ids (logout), persisted in the DB so they survive restarts.
INSECURE_DEFAULT_SECRET = "dev-insecure-secret-change-me-0123456789"
_revoked_mem: set[str] = set()

# In-memory rate limiter (per key). Sufficient for single-process deployments;
# use Redis for multi-worker production setups.
_rate: dict[str, list[float]] = {}


def rate_limit(key: str, limit: int = 10, window_sec: int = 60) -> None:
    if not settings.rate_limit_enabled:
        return
    now = time.time()
    hits = [t for t in _rate.get(key, []) if now - t < window_sec]
    if len(hits) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited")
    hits.append(now)
    _rate[key] = hits


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def is_revoked(token: str, db: Session) -> bool:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        return True
    jti = payload.get("jti")
    if not jti:
        return True
    if jti in _revoked_mem:
        return True
    from models.db import RevokedToken
    return db.get(RevokedToken, jti) is not None


def create_token(user_id: str) -> str:
    import uuid
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.session_hours)
    return jwt.encode(
        {"sub": user_id, "exp": exp, "jti": uuid.uuid4().hex},
        settings.jwt_secret, algorithm=settings.jwt_algorithm,
    )


def revoke_token(token: str, db: Session | None = None) -> None:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    jti = payload.get("jti")
    if not jti:
        return
    if db is not None:
        from models.db import RevokedToken
        if not db.get(RevokedToken, jti):
            db.add(RevokedToken(jti=jti, expires_at=datetime.fromtimestamp(
                payload["exp"], tz=timezone.utc).replace(tzinfo=None)))
            db.commit()
    else:
        _revoked_mem.add(jti)


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload.get("sub")
    except Exception:
        return None


COOKIE_NAME = "wassilha_session"


def set_session_cookie(response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_hours * 3600,
        path="/",
    )


def clear_session_cookie(response, request: Request | None = None, db: Session | None = None) -> None:
    if request is not None:
        token = request.cookies.get(COOKIE_NAME)
        if token:
            try:
                revoke_token(token, db)
            except Exception:
                pass
    response.delete_cookie(COOKIE_NAME, path="/")


def user_from_request(request: Request, db: Session) -> User | None:
    token = request.cookies.get(COOKIE_NAME)
    if token and not is_revoked(token, db):
        user_id = decode_token(token)
        if user_id:
            user = db.get(User, user_id)
            if user:
                return user
    # Preview mode: sandboxed preview iframes cannot store cookies, so the
    # hosting proxy's X-Visitor-Id header acts as the session instead.
    if settings.preview_mode:
        from services.preview import get_or_create_visitor
        return get_or_create_visitor(request.headers.get("x-visitor-id", ""), db)
    return None


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = user_from_request(request, db)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    return user


async def ws_user(request: Request, db: Session) -> User | None:
    """Authenticate a WebSocket handshake from the session cookie."""
    return user_from_request(request, db)
