import re
import threading
import time

from fastapi import HTTPException, status

from app.schemas.profile import BadgeRead
from app.supabase_client import get_supabase

# Sent as error details so the frontend can show a translated message.
INVALID_CODE = "invalid_badge_code"
ALREADY_HAVE = "badge_already_have"
TOO_MANY_ATTEMPTS = "badge_too_many_attempts"
BADGE_REQUIRED = "badge_required"

# Wrong codes allowed per user in the window before redeeming is paused, against guessing.
_MAX_FAILURES = 5
_FAILURE_WINDOW = 15 * 60  # seconds
_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


def list_badges(user_id: str) -> list[BadgeRead]:
    rows = (
        get_supabase()
        .table("user_badges")
        .select("badge, granted_at, badges(sort_order)")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    rows.sort(key=lambda r: ((r.get("badges") or {}).get("sort_order", 0), r["granted_at"]))
    return [BadgeRead(key=r["badge"], granted_at=r["granted_at"]) for r in rows]


def has_badge(user_id: str, badge: str) -> bool:
    rows = (
        get_supabase()
        .table("user_badges")
        .select("badge")
        .eq("user_id", user_id)
        .eq("badge", badge)
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def require_badge(user_id: str, badge: str) -> None:
    if not has_badge(user_id, badge):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=BADGE_REQUIRED)


def _normalize(code: str) -> str | None:
    """CORAL-7K3M-Q9XP, coral 7k3m q9xp or 7K3MQ9XP → 7K3MQ9XP."""
    c = re.sub(r"[^A-Z0-9]", "", code.upper())
    if c.startswith("CORAL") and len(c) == 13:
        c = c[5:]
    return c if re.fullmatch(r"[A-HJKMNP-Z2-9]{8}", c) else None


def _recent_failures(user_id: str, now: float) -> list[float]:
    recent = [t for t in _failures.get(user_id, []) if now - t < _FAILURE_WINDOW]
    _failures[user_id] = recent
    return recent


def redeem(user_id: str, code: str) -> list[BadgeRead]:
    now = time.monotonic()
    with _failures_lock:
        if len(_recent_failures(user_id, now)) >= _MAX_FAILURES:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=TOO_MANY_ATTEMPTS
            )

    normalized = _normalize(code)
    result = "invalid"
    if normalized:
        rows = (
            get_supabase()
            .rpc("redeem_badge_code", {"p_user": user_id, "p_code": normalized})
            .execute()
            .data
            or []
        )
        result = rows[0]["status"] if rows else "invalid"

    if result == "invalid":
        with _failures_lock:
            _recent_failures(user_id, now).append(now)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=INVALID_CODE)
    if result == "already":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_HAVE)
    return list_badges(user_id)
