from fastapi import HTTPException, status

from app.schemas.feedback import (
    LEADERBOARD_MIN_REVIEWS,
    FeedbackCreate,
    FeedbackRead,
    LeaderboardEntry,
    LeaderboardPeriod,
    LeaderboardStanding,
)
from app.schemas.request import ProfileSummary, RequestStatus
from app.services.moderation import ensure_allowed
from app.supabase_client import get_supabase


def _fetch_profiles(user_ids: set[str]) -> dict[str, dict]:
    if not user_ids:
        return {}
    res = (
        get_supabase()
        .table("profiles")
        .select("id, display_name, avatar_url, worn_badge, is_deleted")
        .in_("id", list(user_ids))
        .execute()
    )
    return {row["id"]: row for row in (res.data or [])}


def _hydrate_feedback(row: dict, profiles: dict[str, dict]) -> FeedbackRead:
    return FeedbackRead(
        id=row["id"],
        request_id=row["request_id"],
        from_user=ProfileSummary(**profiles[row["from_user_id"]]),
        to_user=ProfileSummary(**profiles[row["to_user_id"]]),
        rating=row["rating"],
        # Hide only the text of a flagged review; the rating still counts.
        comment=None if row.get("moderation_flagged") else row.get("comment"),
        created_at=row["created_at"],
    )


def list_feedbacks_for_request(request_id: str) -> list[FeedbackRead]:
    rows = (
        get_supabase()
        .table("feedbacks")
        .select("*")
        .eq("request_id", request_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    if not rows:
        return []
    user_ids = {r["from_user_id"] for r in rows} | {r["to_user_id"] for r in rows}
    profiles = _fetch_profiles(user_ids)
    return [
        _hydrate_feedback(r, profiles)
        for r in rows
        if not profiles[r["from_user_id"]].get("is_deleted")
        and not profiles[r["to_user_id"]].get("is_deleted")
    ]


def create_feedback(user_id: str, request_id: str, payload: FeedbackCreate) -> FeedbackRead:
    req_rows = (
        get_supabase()
        .table("requests")
        .select("requester_id, helper_id, status")
        .eq("id", request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not req_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    req = req_rows[0]
    if req["status"] != RequestStatus.completed.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Feedback can only be left on completed requests (currently {req['status']})",
        )

    if user_id == req["requester_id"]:
        to_user_id = req["helper_id"]
    elif user_id == req.get("helper_id"):
        to_user_id = req["requester_id"]
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requester or helper can leave feedback",
        )

    if not to_user_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Completed request is missing a counterpart",
        )

    existing_rows = (
        get_supabase()
        .table("feedbacks")
        .select("id")
        .eq("request_id", request_id)
        .eq("from_user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing_rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already left feedback for this request",
        )

    moderated = ensure_allowed(payload.comment)
    inserted = (
        get_supabase()
        .table("feedbacks")
        .insert({
            "request_id": request_id,
            "from_user_id": user_id,
            "to_user_id": to_user_id,
            "rating": payload.rating,
            "comment": payload.comment,
            "moderated": moderated,
        })
        .execute()
        .data
    )
    row = (inserted or [None])[0]
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to insert feedback",
        )
    profiles = _fetch_profiles({row["from_user_id"], row["to_user_id"]})
    return _hydrate_feedback(row, profiles)


def _leaderboard_rows(period: LeaderboardPeriod) -> list[dict]:
    """Every helper with a valid review in the period, ranked ones first (migration 0029)."""
    return get_supabase().rpc("leaderboard", {"p_period": period}).execute().data or []


def get_leaderboard(limit: int = 10, period: LeaderboardPeriod = "all") -> list[LeaderboardEntry]:
    rows = [r for r in _leaderboard_rows(period) if r["rank"] is not None][:limit]
    if not rows:
        return []
    profiles = _fetch_profiles({r["user_id"] for r in rows})
    entries: list[LeaderboardEntry] = []
    for r in rows:
        profile = profiles.get(r["user_id"])
        if not profile or profile.get("is_deleted"):
            continue
        entries.append(
            LeaderboardEntry(
                user=ProfileSummary(**profile),
                avg_rating=float(r["avg_rating"]),
                feedback_count=int(r["feedback_count"]),
                score=float(r["score"]),
                rank=int(r["rank"]),
            )
        )
    return entries


def get_standing(user_id: str, period: LeaderboardPeriod = "all") -> LeaderboardStanding:
    rows = _leaderboard_rows(period)
    mine = next((r for r in rows if r["user_id"] == user_id), None)
    # The prior is the same on every row; with no reviews at all it is the fallback.
    prior = rows[0] if rows else {"prior_mean": 4.5, "prior_weight": 5}
    count = int(mine["feedback_count"]) if mine else 0
    return LeaderboardStanding(
        rank=mine["rank"] if mine else None,
        avg_rating=float(mine["avg_rating"]) if mine else None,
        feedback_count=count,
        score=float(mine["score"]) if mine else None,
        needed=max(0, LEADERBOARD_MIN_REVIEWS - count),
        prior_mean=float(prior["prior_mean"]),
        prior_weight=float(prior["prior_weight"]),
    )
