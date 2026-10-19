import uuid

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings
from app.schemas.media import MediaRead
from app.services.moderation import CONTENT_REJECTED, MEDIA_BUCKET, check_media
from app.supabase_client import get_supabase

_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
_VIDEO_TYPES = {"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_VIDEO_BYTES = 20 * 1024 * 1024


def _public_url(path: str) -> str:
    return get_supabase().storage.from_(MEDIA_BUCKET).get_public_url(path)


def upload(user_id: str, file: UploadFile) -> MediaRead:
    """Moderate an uploaded image / video, then store it.

    Flagged files are rejected before anything is stored. If moderation is
    unavailable the file is stored with moderated = false for the sweep.
    """
    mime_type = (file.content_type or "").lower()
    if mime_type in _IMAGE_TYPES:
        kind, ext, limit = "image", _IMAGE_TYPES[mime_type], MAX_IMAGE_BYTES
    elif mime_type in _VIDEO_TYPES:
        if not get_settings().media_video_enabled:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="video_disabled")
        kind, ext, limit = "video", _VIDEO_TYPES[mime_type], MAX_VIDEO_BYTES
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="unsupported_media_type",
        )

    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="file_too_large",
        )

    try:
        verdict = check_media(kind, mime_type, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unreadable_video",
        ) from exc
    if verdict is False:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=CONTENT_REJECTED,
        )

    path = f"{user_id}/{uuid.uuid4()}.{ext}"
    get_supabase().storage.from_(MEDIA_BUCKET).upload(
        path, data, {"content-type": mime_type}
    )
    row = (
        get_supabase()
        .table("media")
        .insert({
            "owner_id": user_id,
            "path": path,
            "kind": kind,
            "mime_type": mime_type,
            "size_bytes": len(data),
            "moderated": verdict is True,
        })
        .execute()
        .data
    )[0]
    return MediaRead(id=row["id"], kind=kind, url=_public_url(path))


def validate_attachments(user_id: str, media_ids: list[str]) -> list[str]:
    """Check the caller owns every attachment and none was taken down."""
    if not media_ids:
        return []
    ids = list(dict.fromkeys(media_ids))
    rows = (
        get_supabase()
        .table("media")
        .select("id, owner_id, moderation_flagged")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    valid = {r["id"] for r in rows if r["owner_id"] == user_id and not r["moderation_flagged"]}
    if len(valid) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid attachment",
        )
    return ids


def fetch(media_ids: set[str]) -> dict[str, MediaRead]:
    """Visible (not taken down) media by id."""
    if not media_ids:
        return {}
    rows = (
        get_supabase()
        .table("media")
        .select("id, kind, path, moderation_flagged")
        .in_("id", list(media_ids))
        .execute()
        .data
        or []
    )
    return {
        r["id"]: MediaRead(id=r["id"], kind=r["kind"], url=_public_url(r["path"]))
        for r in rows
        if not r["moderation_flagged"]
    }


def attached(row: dict, media_by_id: dict[str, MediaRead]) -> list[MediaRead]:
    return [media_by_id[i] for i in (row.get("media_ids") or []) if i in media_by_id]


def all_ids(rows: list[dict]) -> set[str]:
    return {i for r in rows for i in (r.get("media_ids") or [])}


def delete(media_ids: list[str]) -> None:
    """Remove files and rows, e.g. when the post they belong to is deleted."""
    if not media_ids:
        return
    db = get_supabase()
    rows = db.table("media").select("id, path").in_("id", media_ids).execute().data or []
    if rows:
        db.storage.from_(MEDIA_BUCKET).remove([r["path"] for r in rows])
        db.table("media").delete().in_("id", [r["id"] for r in rows]).execute()
