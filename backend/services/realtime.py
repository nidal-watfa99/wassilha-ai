"""WebSocket connection manager for messaging updates and WebRTC signaling.

Every message first goes through an authenticated HTTP endpoint (which returns
"accepted by the server"), then events are broadcast to online members.
"""
import asyncio
import json
import logging

from fastapi import WebSocket

log = logging.getLogger("wassilha.realtime")


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> set of websockets (a user may have several tabs/devices)
        self._users: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._users.setdefault(user_id, set()).add(ws)

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._users.get(user_id)
            if conns:
                conns.discard(ws)
                if not conns:
                    self._users.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return bool(self._users.get(user_id))

    async def send_to_user(self, user_id: str, payload: dict) -> None:
        conns = list(self._users.get(user_id, []))
        for ws in conns:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                await self.disconnect(user_id, ws)

    async def send_to_users(self, user_ids: list[str], payload: dict) -> None:
        for uid in set(user_ids):
            await self.send_to_user(uid, payload)


manager = ConnectionManager()
