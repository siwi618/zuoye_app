import base64
import logging
import os
import re
import subprocess
import tempfile

import httpx
from fastapi import HTTPException, status

from app.config import get_settings
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_MODERATION_URL = "https://api.openai.com/v1/moderations"
_MODEL = "omni-moderation-latest"

# Plain "violence" fires on fight scenes in anime, novels, games and history,
# which students discuss all the time. Real threats still trip
# harassment/threatening, and gore trips violence/graphic.
_IGNORED_CATEGORIES = {"violence"}

# Frames sampled from each video (the model takes one image per request).
_VIDEO_FRAMES = 6

_FFMPEG = os.environ.get("FFMPEG_BINARY", "ffmpeg")

MEDIA_BUCKET = "media"

# Sent as the error detail so the frontend can show a translated message.
CONTENT_REJECTED = "content_rejected"

# Tables with user-visible text, and the columns the sweep re-checks.
_SWEEP_TABLES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("profiles", ("display_name",)),
    ("requests", ("topic", "description", "meeting_info")),
    ("feedbacks", ("comment",)),
    ("forum_posts", ("title", "body")),
    ("forum_comments", ("body",)),
    ("request_messages", ("body",)),
)


def _moderate(inputs: list | str) -> bool | None:
    """One moderation call. True = clean, False = flagged, None = unavailable."""
    api_key = get_settings().openai_api_key
    if not api_key:
        return None

    try:
        res = httpx.post(
            _MODERATION_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": _MODEL, "input": inputs},
            timeout=15.0,
        )
        res.raise_for_status()
        results = res.json()["results"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("Moderation check skipped: %s", exc)
        return None

    return not any(
        flagged and category not in _IGNORED_CATEGORIES
        for r in results
        for category, flagged in r.get("categories", {}).items()
    )


def check(*texts: str | None) -> bool | None:
    """Ask OpenAI's moderation model whether user-facing text is acceptable.

    Returns True (clean), False (flagged) or None (could not check: no
    OPENAI_API_KEY, or OpenAI unreachable). Uses the model's own per-category
    verdicts, except _IGNORED_CATEGORIES — lenient enough for normal student
    chat, but blocks overt harassment, hate, sexual, graphic or illicit content.
    """
    inputs = [t for t in texts if t and t.strip()]
    if not inputs:
        return True
    return _moderate(inputs)


def _image_input(data: bytes, mime_type: str) -> dict:
    url = f"data:{mime_type};base64,{base64.b64encode(data).decode()}"
    return {"type": "image_url", "image_url": {"url": url}}


def video_frames(data: bytes) -> list[bytes]:
    """Sample evenly spaced JPEG frames from a video with ffmpeg.

    Raises ValueError if the file can't be decoded as a video.
    """
    with tempfile.NamedTemporaryFile(suffix=".video") as f:
        f.write(data)
        f.flush()
        # `ffmpeg -i` with no output prints "Duration: HH:MM:SS.xx" to stderr.
        probe = subprocess.run(
            [_FFMPEG, "-hide_banner", "-i", f.name],
            capture_output=True, text=True, timeout=30,
        )
        match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", probe.stderr)
        if not match:
            raise ValueError("not a readable video")
        hours, minutes, seconds = match.groups()
        duration = int(hours) * 3600 + int(minutes) * 60 + float(seconds)

        frames: list[bytes] = []
        for i in range(_VIDEO_FRAMES):
            at = duration * (i + 0.5) / _VIDEO_FRAMES
            out = subprocess.run(
                [_FFMPEG, "-v", "error", "-ss", f"{at:.2f}", "-i", f.name,
                 "-frames:v", "1", "-vf", "scale=512:-2", "-f", "image2",
                 "-c:v", "mjpeg", "pipe:1"],
                capture_output=True, timeout=30,
            )
            if out.returncode == 0 and out.stdout:
                frames.append(out.stdout)
        if not frames:
            raise ValueError("no frames could be extracted")
        return frames


def check_media(kind: str, mime_type: str, data: bytes) -> bool | None:
    """Moderate an image, or a sample of frames from a video.

    Same return convention as check(). Raises ValueError for unreadable videos.
    """
    if kind == "image":
        images = [_image_input(data, mime_type)]
    else:
        images = [_image_input(frame, "image/jpeg") for frame in video_frames(data)]

    unavailable = False
    for image in images:
        verdict = _moderate([image])
        if verdict is False:
            return False
        if verdict is None:
            unavailable = True
    return None if unavailable else True


def ensure_allowed(*texts: str | None) -> bool:
    """Raise 422 if the text is flagged; otherwise return whether it was checked.

    The return value is stored in the row's `moderated` column — False means
    moderation was unavailable and sweep() will re-check the row later.
    """
    verdict = check(*texts)
    if verdict is False:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=CONTENT_REJECTED,
        )
    return verdict is True


def is_allowed(*texts: str | None) -> bool:
    """True unless the text is flagged. Fails open when moderation is unavailable."""
    return check(*texts) is not False


def _sweep_media(ids: list[str], stats: dict[str, int]) -> bool:
    """Re-check queued media files. Returns False if moderation is still unavailable."""
    db = get_supabase()
    rows = db.table("media").select("id,path,kind,mime_type").in_("id", ids).execute().data or []
    for row in rows:
        try:
            data = db.storage.from_(MEDIA_BUCKET).download(row["path"])
            verdict = check_media(row["kind"], row["mime_type"], data)
        except ValueError:
            verdict = False  # unreadable video — treat as unsafe
        if verdict is None:
            return False

        updates: dict[str, object] = {"moderated": True}
        if verdict is False:
            stats["flagged"] += 1
            updates["moderation_flagged"] = True
            db.storage.from_(MEDIA_BUCKET).remove([row["path"]])
        db.table("media").update(updates).eq("id", row["id"]).execute()
        stats["checked"] += 1
    return True


def sweep(batch_size: int = 50) -> dict[str, int]:
    """Re-check rows saved while moderation was unavailable (moderated = false).

    Works off the moderation_queue view, which already leaves out content of
    soft-deleted users. Flagged content is hidden (moderation_flagged = true,
    which also notifies the author via a DB trigger); a flagged display name
    is replaced with a neutral one. Stops early if OpenAI is still
    unreachable, leaving the rest for the next run.
    """
    stats = {"checked": 0, "flagged": 0}
    db = get_supabase()
    queue = db.table("moderation_queue").select("source,id").limit(batch_size).execute().data or []

    ids_by_table: dict[str, list[str]] = {}
    for item in queue:
        ids_by_table.setdefault(item["source"], []).append(item["id"])

    for table, fields in _SWEEP_TABLES:
        ids = ids_by_table.get(table)
        if not ids:
            continue
        rows = db.table(table).select(",".join(("id", *fields))).in_("id", ids).execute().data or []
        for row in rows:
            verdict = check(*(row.get(f) for f in fields))
            if verdict is None:
                return stats

            updates: dict[str, object] = {"moderated": True}
            if verdict is False:
                stats["flagged"] += 1
                if table == "profiles":
                    updates["display_name"] = f"user_{row['id'][:6]}"
                    db.table("moderation_notices").insert({
                        "user_id": row["id"], "source": "profiles", "item_id": row["id"],
                    }).execute()
                else:
                    updates["moderation_flagged"] = True
            db.table(table).update(updates).eq("id", row["id"]).execute()
            stats["checked"] += 1

    if ids_by_table.get("media"):
        _sweep_media(ids_by_table["media"], stats)
    return stats
