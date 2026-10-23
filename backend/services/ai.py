"""AI assistant service.

Server-side adapter for an OpenAI-compatible chat-completions API.
Credentials live ONLY on the server (environment variables). If the provider
is not configured, the API returns 503 with `ai_not_configured` - the app
shows an explicit "not configured" state and never fakes a response.
"""
import logging

import httpx

from config import settings

log = logging.getLogger("wassilha.ai")


class AINotConfigured(Exception):
    pass


def is_configured() -> bool:
    return bool(settings.ai_base_url and settings.ai_api_key and settings.ai_model)


async def chat(messages: list[dict]) -> str:
    """Call the configured provider. Raises AINotConfigured or httpx errors."""
    if not is_configured():
        raise AINotConfigured()
    url = settings.ai_base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": settings.ai_model,
        "messages": messages,
        "max_tokens": 1024,
    }
    headers = {"Authorization": f"Bearer {settings.ai_api_key}"}
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError):
        log.warning("Unexpected AI provider response shape")
        raise RuntimeError("ai_bad_response")
