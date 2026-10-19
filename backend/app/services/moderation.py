import logging

import httpx
from fastapi import HTTPException, status

from app.config import get_settings

logger = logging.getLogger(__name__)

_MODERATION_URL = "https://api.openai.com/v1/moderations"
_MODEL = "omni-moderation-latest"

# Sent as the error detail so the frontend can show a translated message.
CONTENT_REJECTED = "content_rejected"


def is_allowed(*texts: str | None) -> bool:
    """Ask OpenAI's moderation model whether user-facing text is acceptable.

    Uses the model's own `flagged` verdict — lenient enough for normal student
    chat, but blocks overt harassment, hate, sexual, violent or illicit content.
    Fails open: with no OPENAI_API_KEY, or if OpenAI is unreachable, text is
    allowed so posting keeps working.
    """
    inputs = [t for t in texts if t and t.strip()]
    api_key = get_settings().openai_api_key
    if not inputs or not api_key:
        return True

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
        return True

    return not any(r.get("flagged") for r in results)


def ensure_allowed(*texts: str | None) -> None:
    """Raise 422 if any of the texts is flagged by moderation."""
    if not is_allowed(*texts):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=CONTENT_REJECTED,
        )
