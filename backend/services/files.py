"""File storage: validated uploads with generated names, authorized downloads.

Security rules:
- Original filenames are NEVER used as storage paths (path traversal / collision).
- MIME type + extension allowlist, configurable size limits.
- Downloads require ownership of the file OR membership in the conversation the
  file's message belongs to.
"""
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from config import settings

ALLOWED = {
    # mime -> allowed extensions
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/webp": {".webp"},
    "image/gif": {".gif"},
    "video/mp4": {".mp4"},
    "video/webm": {".webm"},
    "audio/webm": {".webm"},
    "audio/ogg": {".ogg", ".oga", ".opus"},
    "audio/mpeg": {".mp3"},
    "audio/mp4": {".m4a"},
    "audio/wav": {".wav"},
    "application/pdf": {".pdf"},
    "text/plain": {".txt"},
    "text/markdown": {".md"},
}

MAX_NAME_LEN = 200
_safe_name_re = re.compile(r"[^\w.\-\u0600-\u06FF ]+")

# Lightweight content-signature checks for binary types. The declared MIME
# type is never trusted alone: the first bytes of the payload must match.
# Plain-text types (txt/md) have no signature and are not sniffed.
MAGIC: dict[str, tuple] = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "application/pdf": (b"%PDF-",),
    "audio/wav": (b"RIFF",),  # + WAVE check below
    "audio/ogg": (b"OggS",),
    "video/webm": (b"\x1a\x45\xdf\xa3",),
    "audio/webm": (b"\x1a\x45\xdf\xa3",),
    "audio/mpeg": (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"),
    "video/mp4": (b"ftyp",),   # at offset 4
    "audio/mp4": (b"ftyp",),
}


def _content_matches(mime: str, data: bytes) -> bool:
    sigs = MAGIC.get(mime)
    if not sigs:
        return True  # text types: no signature to verify
    if mime == "audio/wav":
        return data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if mime in ("video/mp4", "audio/mp4"):
        return data[4:8] == b"ftyp"
    return any(data.startswith(s) for s in sigs)


def sanitize_filename(name: str) -> str:
    """Return a safe, display-only version of the original filename."""
    name = (name or "file")[:MAX_NAME_LEN].replace("\\", "/").split("/")[-1]
    return _safe_name_re.sub("_", name).strip() or "file"


def validate_upload(file: UploadFile, max_mb: int) -> tuple[bytes, str, int]:
    """Read and validate an upload. Returns (data, safe_name, size)."""
    limit = max_mb * 1024 * 1024
    data = b""
    while True:
        chunk = file.file.read(1024 * 1024)
        if not chunk:
            break
        data += chunk
        if len(data) > limit:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file_too_large")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="empty_file")

    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="unsupported_file_type")
    # The extension of the ORIGINAL filename must also match the allowlist -
    # never trust the client-supplied MIME alone.
    import os as _os
    ext = _os.path.splitext(file.filename or "")[1].lower()
    if ext and ext not in ALLOWED[mime]:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="unsupported_file_type")
    # The payload's magic bytes must match the declared type.
    if not _content_matches(mime, data):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="unsupported_file_type")
    return data, sanitize_filename(file.filename), len(data)


def store_file(data: bytes, mime: str) -> str:
    """Write bytes to the upload dir under a generated unique name."""
    exts = ALLOWED[mime]
    ext = ""
    # derive extension from mime allowlist only - never from the client name
    preferred = {"image/jpeg": ".jpg", "audio/ogg": ".oga", "audio/mpeg": ".mp3"}
    ext = preferred.get(mime) or sorted(exts)[0]
    stored_name = uuid.uuid4().hex + ext
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    (path / stored_name).write_bytes(data)
    return stored_name


def file_path(stored_name: str) -> Path:
    # stored_name is server-generated; still validate the shape defensively
    if not re.fullmatch(r"[0-9a-f]{32}(\.[a-z0-9]{1,5})?", stored_name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_file")
    return Path(settings.upload_dir) / stored_name


def delete_file(stored_name: str) -> None:
    try:
        p = file_path(stored_name)
        if p.exists():
            p.unlink()
    except Exception:
        pass
