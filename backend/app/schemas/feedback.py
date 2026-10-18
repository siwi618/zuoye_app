from datetime import datetime
from typing import Annotated

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


class LeaderboardEntry(BaseModel):
    user: ProfileSummary
    avg_rating: float
    feedback_count: int
