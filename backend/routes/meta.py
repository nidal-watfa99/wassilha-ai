"""Health, public config and app info endpoints."""
from fastapi import APIRouter, Depends

from config import settings
from models.db import User
from services.security import current_user

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/config/webrtc")
def webrtc_config(user: User = Depends(current_user)):
    """ICE servers for WebRTC (authenticated). Static TURN credentials are
    served only to signed-in users; short-lived REST credentials via a coturn
    REST API are the recommended production setup (see docs/DEPLOYMENT.md)."""
    ice = [{"urls": settings.stun_url}]
    if settings.turn_url and settings.turn_username and settings.turn_credential:
        ice.append({
            "urls": settings.turn_url,
            "username": settings.turn_username,
            "credential": settings.turn_credential,
        })
    return {"iceServers": ice, "turnConfigured": bool(settings.turn_url)}


@router.get("/about")
def about():
    return {
        "name": "Wassilha AI",
        "version": "1.0.0",
        "description_ar": "منصة تواصل وإنتاجية مدعومة بالذكاء الاصطناعي",
        "features": [
            "auth", "contacts", "messaging", "files", "voice-notes", "calls",
            "ai-assistant", "tasks", "calendar", "documents", "insights",
            "products", "payments", "settings",
        ],
    }
