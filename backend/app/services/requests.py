from fastapi import HTTPException, status

from datetime import datetime, timezone

from app.schemas.request import (
    ProfileSummary,
    RequestCreate,
    RequestRead,
    RequestStatus,
    RequestUpdate,
    ScheduleRequest,
)
from app.services.moderation import ensure_allowed
from app.supabase_client import get_supabase


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hydrate_request(row: dict, profiles_by_id: dict[str, dict]) -> RequestRead:
    requester_row = profiles_by_id.get(row["requester_id"])
    if not requester_row:
        # Should never happen — requester FK is NOT NULL.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Requester profile {row['requester_id']} not found",
        )

    helper_row = profiles_by_id.get(row["helper_id"]) if row.get("helper_id") else None

    return RequestRead(
        id=row["id"],
        requester=ProfileSummary(**requester_row),
        helper=ProfileSummary(**helper_row) if helper_row else None,
        grade=row["grade"],
        subject=row["subject"],
        topic=row.get("topic"),
        description=row["description"],
        mode=row["mode"],
        status=row["status"],
        scheduled_at=row.get("scheduled_at"),
        meeting_info=row.get("meeting_info"),
        created_at=row["created_at"],
        accepted_at=row.get("accepted_at"),
        completed_at=row.get("completed_at"),
    )


def _fetch_profiles(user_ids: set[str]) -> dict[str, dict]:
    if not user_ids:
        return {}
    res = (
        get_supabase()
        .table("profiles")
        .select("id, display_name, avatar_url, is_deleted")
        .in_("id", list(user_ids))
        .execute()
    )
    return {row["id"]: row for row in (res.data or [])}


def _involves_deleted(row: dict, profiles_by_id: dict[str, dict]) -> bool:
    """True if the requester or helper is soft-deleted — such requests are hidden."""
    for user_id in (row["requester_id"], row.get("helper_id")):
        if user_id and profiles_by_id.get(user_id, {}).get("is_deleted"):
            return True
    return False


def list_requests(
    user_id: str,
    *,
    status_filter: RequestStatus | None = None,
    subject: str | None = None,
    grade: str | None = None,
    mine: bool = False,
    exclude_mine: bool = False,
    limit: int = 50,
) -> list[RequestRead]:
    query = (
        get_supabase()
        .table("requests")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
    )

    if status_filter:
        query = query.eq("status", status_filter.value)
    if subject:
        query = query.eq("subject", subject)
    if grade:
        query = query.eq("grade", grade)
    if mine:
        query = query.or_(f"requester_id.eq.{user_id},helper_id.eq.{user_id}")
    if exclude_mine:
        query = query.neq("requester_id", user_id)

    rows = query.execute().data or []
    if not rows:
        return []

    user_ids: set[str] = set()
    for r in rows:
        user_ids.add(r["requester_id"])
        if r.get("helper_id"):
            user_ids.add(r["helper_id"])

    profiles = _fetch_profiles(user_ids)
    return [_hydrate_request(r, profiles) for r in rows if not _involves_deleted(r, profiles)]


def get_request(request_id: str) -> RequestRead:
    rows = (
        get_supabase()
        .table("requests")
        .select("*")
        .eq("id", request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    row = rows[0]

    user_ids = {row["requester_id"]}
    if row.get("helper_id"):
        user_ids.add(row["helper_id"])
    profiles = _fetch_profiles(user_ids)
    if _involves_deleted(row, profiles):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return _hydrate_request(row, profiles)


def create_request(user_id: str, payload: RequestCreate) -> RequestRead:
    ensure_allowed(payload.topic, payload.description)
    insert = (
        get_supabase()
        .table("requests")
        .insert({
            "requester_id": user_id,
            "grade": payload.grade,
            "subject": payload.subject,
            "topic": payload.topic,
            "description": payload.description,
            "mode": payload.mode.value,
        })
        .execute()
    )
    row = (insert.data or [None])[0]
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create request",
        )
    profiles = _fetch_profiles({row["requester_id"]})
    return _hydrate_request(row, profiles)


def update_request(user_id: str, request_id: str, payload: RequestUpdate) -> RequestRead:
    existing_rows = (
        get_supabase()
        .table("requests")
        .select("*")
        .eq("id", request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not existing_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    existing = existing_rows[0]
    if existing["requester_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requester can edit this request",
        )
    if existing["status"] != RequestStatus.open.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request can only be edited while it is open",
        )

    updates = payload.model_dump(exclude_none=True, mode="json")
    if not updates:
        return get_request(request_id)
    ensure_allowed(updates.get("topic"), updates.get("description"))

    updated = (
        get_supabase()
        .table("requests")
        .update(updates)
        .eq("id", request_id)
        .execute()
        .data
    )
    row = (updated or [None])[0]
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update request",
        )
    return get_request(row["id"])


def _get_row(request_id: str) -> dict:
    rows = (
        get_supabase()
        .table("requests")
        .select("*")
        .eq("id", request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return rows[0]


def accept_request(user_id: str, request_id: str) -> RequestRead:
    row = _get_row(request_id)
    if row["requester_id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot accept your own request",
        )
    if row["status"] != RequestStatus.open.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Request is {row['status']}, not open",
        )

    # Conditional update: only succeed if it's still open. This avoids races where
    # two users hit Accept at the same time.
    updated = (
        get_supabase()
        .table("requests")
        .update({
            "helper_id": user_id,
            "status": RequestStatus.accepted.value,
            "accepted_at": _now_iso(),
        })
        .eq("id", request_id)
        .eq("status", RequestStatus.open.value)
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Request was just accepted by someone else",
        )
    return get_request(request_id)


def schedule_request(user_id: str, request_id: str, payload: ScheduleRequest) -> RequestRead:
    row = _get_row(request_id)
    if user_id not in (row["requester_id"], row.get("helper_id")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requester or helper can schedule",
        )
    if row["status"] != RequestStatus.accepted.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Request must be accepted to schedule (currently {row['status']})",
        )

    ensure_allowed(payload.meeting_info)
    get_supabase().table("requests").update({
        "scheduled_at": payload.scheduled_at.isoformat(),
        "meeting_info": payload.meeting_info,
    }).eq("id", request_id).execute()
    return get_request(request_id)


def complete_request(user_id: str, request_id: str) -> RequestRead:
    row = _get_row(request_id)
    if user_id not in (row["requester_id"], row.get("helper_id")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requester or helper can mark complete",
        )
    if row["status"] != RequestStatus.accepted.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Request must be accepted to complete (currently {row['status']})",
        )

    get_supabase().table("requests").update({
        "status": RequestStatus.completed.value,
        "completed_at": _now_iso(),
    }).eq("id", request_id).execute()
    return get_request(request_id)


def cancel_request(user_id: str, request_id: str) -> RequestRead:
    existing_rows = (
        get_supabase()
        .table("requests")
        .select("requester_id, status")
        .eq("id", request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not existing_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    existing = existing_rows[0]
    if existing["requester_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requester can cancel this request",
        )
    if existing["status"] not in (RequestStatus.open.value, RequestStatus.accepted.value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only open or accepted requests can be cancelled",
        )

    get_supabase().table("requests").update(
        {"status": RequestStatus.cancelled.value}
    ).eq("id", request_id).execute()

    return get_request(request_id)
