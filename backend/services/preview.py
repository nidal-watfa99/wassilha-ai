"""Preview-mode visitor sessions.

The hosted preview runs in a sandboxed iframe where cookies are unavailable.
The preview proxy injects an X-Visitor-Id header on every request (HTTP and
WebSocket); in preview mode we treat that id as a persistent session and
auto-provision an isolated account per visitor, seeded with a little demo
data so the app is immediately explorable.

Only enabled via PREVIEW_MODE=true. The header is only trustworthy behind the
private hosting proxy — never enable this in production.
"""
import secrets

from sqlalchemy.orm import Session

from models.db import Contact, Document, Product, Task, User
from services.security import hash_password

_EMAIL_DOMAIN = "preview.wassilha.local"


def get_or_create_visitor(visitor_id: str, db: Session) -> User | None:
    if not visitor_id:
        return None
    # Email is derived from the visitor id; ids are opaque proxy tokens.
    safe = "".join(c for c in visitor_id if c.isalnum() or c in "-_")[:64]
    if not safe:
        return None
    email = f"visitor-{safe}@{_EMAIL_DOMAIN}"
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        name="زائر المعاينة",
        email=email,
        password_hash=hash_password(secrets.token_urlsafe(32)),
    )
    db.add(user)
    db.flush()

    # Seed a small, honest demo dataset (real rows, no fake metrics).
    db.add_all([
        Task(owner_id=user.id, title="استكشاف واجهة وسيلة AI", status="doing", priority="high"),
        Task(owner_id=user.id, title="تجربة إنشاء مهمة جديدة", status="todo", priority="medium"),
        Task(owner_id=user.id, title="تجربة المراسلة الفورية", status="todo", priority="low"),
        Contact(owner_id=user.id, name="سارة أحمد", email="sara@example.com", phone="+963900000111", company="وسيلة"),
        Contact(owner_id=user.id, name="محمد خالد", email="m.khaled@example.com", phone="+963900000222", company="شركة النور"),
        Document(owner_id=user.id, title="مستند ترحيبي", content="مرحباً بك في وسيلة AI.\n\nهذا مستند تجريبي يمكنك تحريره وحفظه — كل التغييرات حقيقية ومحفوظة في قاعدة البيانات."),
        Product(owner_id=user.id, name="استشارة تقنية", price=150.0, currency="USD"),
    ])
    db.commit()
    return user
