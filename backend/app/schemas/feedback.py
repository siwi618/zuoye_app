from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.request import ProfileSummary

CommentStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: CommentStr


class FeedbackRead(BaseModel):
    id: str
    request_id: str
    from_user: ProfileSummary
    to_user: ProfileSummary
    rating: int
    comment: str | None
    created_at: datetime


# all time, or this month (Asia/Shanghai)
LeaderboardPeriod = Literal["all", "month"]
# Valid reviews needed to be ranked; keep in sync with leaderboard() in migration 0029.
LEADERBOARD_MIN_REVIEWS = 3


class LeaderboardEntry(BaseModel):
    """A ranked helper: ranked by `score`, the rating weighted with imaginary reviews (migration
    0029); `avg_rating` and `feedback_count` are their real average and count of valid reviews."""
    user: ProfileSummary
    avg_rating: float
    feedback_count: int
    score: float = 0
    rank: int = 0


class LeaderboardStanding(BaseModel):
    """Where the caller stands, and the imaginary reviews everyone's score is weighted with."""
    rank: int | None  # None while under LEADERBOARD_MIN_REVIEWS valid reviews
    avg_rating: float | None
    feedback_count: int
    score: float | None
    needed: int  # valid reviews still needed to be ranked
    prior_mean: float  # each helper counts as also having prior_weight reviews of prior_mean
    prior_weight: float
    min_reviews: int = LEADERBOARD_MIN_REVIEWS
