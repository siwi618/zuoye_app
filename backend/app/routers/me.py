from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from app.deps import CurrentUserDep
from app.schemas.profile import GRADES, MyProfile, MyProfileUpdate
from app.supabase_client import get_supabase

router = APIRouter(prefix="/me", tags=["me"])


class ModerationNotice(BaseModel):
    id: str
    source: str
    created_at: datetime


@router.get("")
def get_me(user: CurrentUserDep) -> dict[str, str | None]:
    return {"id": user.id, "email": user.email, "role": user.role}


@router.get("/profile", response_model=MyProfile)
def get_my_profile(user: CurrentUserDep) -> MyProfile:
    rows = (
        get_supabase()
        .table("profiles")
        .select("grade")
        .eq("id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    grade = rows[0].get("grade") if rows else None
    # Legacy free-form values don't count as a confirmed grade.
    return MyProfile(grade=grade if grade in GRADES else None)


@router.put("/profile", response_model=MyProfile)
def update_my_profile(payload: MyProfileUpdate, user: CurrentUserDep) -> MyProfile:
    (
        get_supabase()
        .table("profiles")
        .update({"grade": payload.grade})
        .eq("id", user.id)
        .execute()
    )
    return MyProfile(grade=payload.grade)


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
