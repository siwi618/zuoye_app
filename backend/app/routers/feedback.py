from fastapi import APIRouter, Query

from app.deps import CurrentUserDep
from app.schemas.feedback import FeedbackCreate, FeedbackRead, LeaderboardEntry
from app.services import feedback as svc

router = APIRouter(tags=["feedback"])


@router.get("/requests/{request_id}/feedbacks", response_model=list[FeedbackRead])
def list_feedbacks(user: CurrentUserDep, request_id: str) -> list[FeedbackRead]:
    _ = user  # auth required, no other use
    return svc.list_feedbacks_for_request(request_id)


@router.post("/requests/{request_id}/feedback", response_model=FeedbackRead, status_code=201)
def create_feedback(
    user: CurrentUserDep, request_id: str, payload: FeedbackCreate
) -> FeedbackRead:
    return svc.create_feedback(user.id, request_id, payload)


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def get_leaderboard(
    user: CurrentUserDep,
    limit: int = Query(default=10, ge=1, le=100),
) -> list[LeaderboardEntry]:
    _ = user
    return svc.get_leaderboard(limit=limit)
