from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.deps import CurrentUserDep
from app.schemas.profile import GRADES, MyProfile, MyProfileUpdate, NameUpdate
from app.services.moderation import ensure_allowed
from app.supabase_client import get_supabase

router = APIRouter(prefix="/me", tags=["me"])

# Sent as the error detail so the frontend can show a translated message.
NAME_CHANGE_TOO_SOON = "name_change_too_soon"


class ModerationNotice(BaseModel):
    id: str
    source: str
    created_at: datetime


@router.get("")
def get_me(user: CurrentUserDep) -> dict[str, str | None]:
    return {"id": user.id, "email": user.email, "role": user.role}


# One rename per this many days.
NAME_CHANGE_DAYS = 30


def _read_profile(user_id: str) -> MyProfile:
    rows = (
        get_supabase()
        .table("profiles")
        .select("grade, display_name, display_name_changed_at")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    row = rows[0] if rows else {}
    grade = row.get("grade")
    next_change = None
    if row.get("display_name_changed_at"):
        next_change = datetime.fromisoformat(row["display_name_changed_at"]) + timedelta(
            days=NAME_CHANGE_DAYS
        )
        if next_change <= datetime.now(timezone.utc):
            next_change = None
    return MyProfile(
        # Legacy free-form values don't count as a confirmed grade.
        grade=grade if grade in GRADES else None,
        display_name=row.get("display_name") or "",
        next_name_change_at=next_change,
    )


@router.get("/profile", response_model=MyProfile)
def get_my_profile(user: CurrentUserDep) -> MyProfile:
    return _read_profile(user.id)


@router.put("/profile", response_model=MyProfile)
def update_my_profile(payload: MyProfileUpdate, user: CurrentUserDep) -> MyProfile:
    (
        get_supabase()
        .table("profiles")
        .update({"grade": payload.grade})
        .eq("id", user.id)
        .execute()
    )
    return _read_profile(user.id)


@router.put("/name", response_model=MyProfile)
def change_my_name(payload: NameUpdate, user: CurrentUserDep) -> MyProfile:
    """Rename yourself — once every NAME_CHANGE_DAYS days, and the name is moderated."""
    current = _read_profile(user.id)
    if payload.display_name == current.display_name:
        return current
    if current.next_name_change_at:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=NAME_CHANGE_TOO_SOON)
    moderated = ensure_allowed(payload.display_name)

    db = get_supabase()
    db.table("profiles").update({
        "display_name": payload.display_name,
        "display_name_changed_at": datetime.now(timezone.utc).isoformat(),
        "moderated": moderated,
    }).eq("id", user.id).execute()
    # The header reads the name from the session's user_metadata; keep it in sync.
    db.auth.admin.update_user_by_id(user.id, {"user_metadata": {"display_name": payload.display_name}})
    return _read_profile(user.id)


@router.get("/notices", response_model=list[ModerationNotice])
def list_notices(user: CurrentUserDep) -> list[ModerationNotice]:
    """Unseen notices about the caller's content being taken down by moderation."""
    rows = (
        get_supabase()
        .table("moderation_notices")
        .select("id, source, created_at")
        .eq("user_id", user.id)
        .is_("seen_at", "null")
        .order("created_at")
        .execute()
        .data
        or []
    )
    return [ModerationNotice(**r) for r in rows]


@router.post("/notices/seen", status_code=204)
def mark_notices_seen(user: CurrentUserDep) -> None:
    (
        get_supabase()
        .table("moderation_notices")
        .update({"seen_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", user.id)
        .is_("seen_at", "null")
        .execute()
    )
