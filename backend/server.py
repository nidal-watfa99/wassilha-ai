"""Wassilha AI backend - FastAPI application entry point.

Run:  uvicorn server:app --reload  (development)
"""
import logging
import os

from fastapi import FastAPI, Request, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from models import Base, engine
from routes import ai, auth, commerce, contacts, documents, insights, messaging, meta, tasks, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
# Silence noisy access logs for health checks in dev
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

app = FastAPI(
    title="Wassilha AI API",
    version="1.0.0",
    description="Communication & productivity platform API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# ---- Database schema ----
# Simple, dependency-free startup migration: create tables that don't exist yet.
# For production schema evolution, prefer Alembic (see docs/ARCHITECTURE.md).
Base.metadata.create_all(bind=engine)

# ---- CORS ----
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Requested-With"],
)

# ---- CSRF protection for cookie-based sessions ----
# SameSite=Lax blocks most cross-site sends; additionally every unsafe method
# (POST/PUT/PATCH/DELETE) on /api/* must carry the X-Requested-With header,
# which a cross-site HTML form cannot set. Exempts /api/auth/login|register
# because they are pre-login and anonymous.
_SAFE = {"GET", "HEAD", "OPTIONS", "TRACE"}
_EXEMPT = {"/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/health"}


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    if request.method not in _SAFE and request.url.path.startswith("/api") \
            and request.url.path not in _EXEMPT:
        if request.headers.get("x-requested-with") != "XMLHttpRequest":
            return JSONResponse({"detail": "csrf_header_required"}, status_code=403)
    return await call_next(request)


# ---- Routes ----
for r in (auth.router, contacts.router, tasks.router, documents.router,
          messaging.router, ai.router, commerce.router, insights.router,
          meta.router, ws.router):
    app.include_router(r)


@app.on_event("startup")
def _startup_checks():
    """Fail fast on insecure production configuration."""
    import os as _os
    if _os.environ.get("WASSILHA_ENV", "").lower() == "production":
        from config import settings as _s
        from services.security import INSECURE_DEFAULT_SECRET
        if _s.jwt_secret == INSECURE_DEFAULT_SECRET:
            raise RuntimeError(
                "JWT_SECRET is insecure (default dev value). Set a long random "
                "secret, e.g. `openssl rand -hex 32`, before running in production."
            )


@app.get("/")
def root():
    # When the built frontend is present (production single-origin mode),
    # the site root must serve the app itself, not an API stub.
    index = os.path.join(_dist, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return {"name": "Wassilha AI API", "docs": "/api/docs", "health": "/api/health"}


# Serve the built frontend (production single-origin deployment).
_dist = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_dist):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="static")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        # Strict, safe fallback: only serve files that exist inside _dist;
        # anything else gets index.html. API paths always return JSON 404s
        # because the API routes are matched first.
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "not_found"}, status_code=404)
        candidate = os.path.realpath(os.path.join(_dist, full_path))
        dist_root = os.path.realpath(_dist)
        if full_path and candidate.startswith(dist_root + os.sep) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_dist, "index.html"))
