from datetime import datetime
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.media import MAX_ATTACHMENTS, MediaRead


class RequestStatus(str, Enum):
    open = "open"
    accepted = "accepted"
    completed = "completed"
    cancelled = "cancelled"


class RequestMode(str, Enum):
    online = "online"
    offline = "offline"
    either = "either"


NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
DescriptionStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ProfileSummary(BaseModel):
    """Slim public profile included in request responses."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    display_name: str
    avatar_url: str | None = None


class RequestCreate(BaseModel):
    grade: NonEmptyStr
    subject: NonEmptyStr
    topic: str | None = Field(default=None, max_length=120)
    description: DescriptionStr
    mode: RequestMode = RequestMode.either
    media_ids: list[str] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)


class RequestUpdate(BaseModel):
    """All fields optional — only what's supplied gets changed."""
    grade: NonEmptyStr | None = None
    subject: NonEmptyStr | None = None
    topic: str | None = Field(default=None, max_length=120)
    description: DescriptionStr | None = None
    mode: RequestMode | None = None
    media_ids: list[str] | None = Field(default=None, max_length=MAX_ATTACHMENTS)


class ScheduleRequest(BaseModel):
    scheduled_at: datetime
    meeting_info: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class RequestRead(BaseModel):
    id: str
    requester: ProfileSummary
    helper: ProfileSummary | None
    grade: str
    subject: str
    topic: str | None
    description: str
    media: list[MediaRead] = []
    mode: RequestMode
    status: RequestStatus
    scheduled_at: datetime | None
    meeting_info: str | None
    created_at: datetime
    accepted_at: datetime | None
    completed_at: datetime | None
