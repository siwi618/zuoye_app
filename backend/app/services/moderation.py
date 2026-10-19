import logging

import httpx
from fastapi import HTTPException, status

from app.config import get_settings
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_MODERATION_URL = "https://api.openai.com/v1/moderations"
_MODEL = "omni-moderation-latest"

# Sent as the error detail so the frontend can show a translated message.
CONTENT_REJECTED = "content_rejected"

# Tables with user-visible text, and the columns the sweep re-checks.
_SWEEP_TABLES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("profiles", ("display_name",)),
    ("requests", ("topic", "description", "meeting_info")),
    ("feedbacks", ("comment",)),
    ("forum_posts", ("title", "body")),
    ("forum_comments", ("body",)),
)


def check(*texts: str | None) -> bool | None:
    """Ask OpenAI's moderation model whether user-facing text is acceptable.

    Returns True (clean), False (flagged) or None (could not check: no
    OPENAI_API_KEY, or OpenAI unreachable). Uses the model's own `flagged`
    verdict — lenient enough for normal student chat, but blocks overt
    harassment, hate, sexual, violent or illicit content.
    """
    inputs = [t for t in texts if t and t.strip()]
    if not inputs:
        return True
    api_key = get_settings().openai_api_key
    if not api_key:
        return None

    try:
        res = httpx.post(
            _MODERATION_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": _MODEL, "input": inputs},
            timeout=5.0,
        )
        res.raise_for_status()
        results = res.json()["results"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("Moderation check skipped: %s", exc)
        return None

    return not any(r.get("flagged") for r in results)


def is_allowed(*texts: str | None) -> bool:
    """True unless the text is flagged. Fails open when moderation is unavailable."""
    return check(*texts) is not False


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


def sweep(batch_size: int = 50) -> dict[str, int]:
    """Re-check rows saved while moderation was unavailable (moderated = false).

    Flagged content is hidden (moderation_flagged = true); a flagged display
    name is replaced with a neutral one. Stops early if OpenAI is still
    unreachable, leaving the rest for the next run.
    """
    stats = {"checked": 0, "flagged": 0}
    db = get_supabase()
    for table, fields in _SWEEP_TABLES:
        rows = (
            db.table(table)
            .select(",".join(("id", *fields)))
            .eq("moderated", False)
            .limit(batch_size)
            .execute()
            .data
            or []
        )
        for row in rows:
            verdict = check(*(row.get(f) for f in fields))
            if verdict is None:
                return stats

            updates: dict[str, object] = {"moderated": True}
            if verdict is False:
                stats["flagged"] += 1
                if table == "profiles":
                    updates["display_name"] = f"user_{row['id'][:6]}"
                else:
                    updates["moderation_flagged"] = True
            db.table(table).update(updates).eq("id", row["id"]).execute()
            stats["checked"] += 1
    return stats
