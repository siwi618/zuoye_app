from datetime import datetime
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.media import MAX_ATTACHMENTS, MediaRead

from app.schemas.request import ProfileSummary


class ForumTag(str, Enum):
    study_tips = "Study Tips"
    homework = "Homework"
    exams = "Exams"
    resources = "Resources"
    campus_life = "Campus Life"
    chat = "Chat"
    other = "Other"


class PostSort(str, Enum):
    hot = "hot"  # most viewed first
    new = "new"
    mine = "mine"  # the caller's own posts pinned on top (newest first), then the rest by views


class TimeRange(str, Enum):
    all = "all"
    day = "day"
    week = "week"
    month = "month"


class CommentSort(str, Enum):
    top = "top"  # most liked first
    new = "new"


TitleStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
PostBodyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
CommentBodyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class PostCreate(BaseModel):
    title: TitleStr
    body: PostBodyStr
    tag: ForumTag
    media_ids: list[str] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)


class TopComment(BaseModel):
    """Most-liked comment on a post, previewed in the post list."""
    author_name: str
    body: str
    like_count: int


class PostRead(BaseModel):
    id: str
    author: ProfileSummary
    title: str
    body: str
    media: list[MediaRead] = []
    tag: str
    view_count: int
    like_count: int
    comment_count: int
    liked_by_me: bool
    created_at: datetime
    top_comment: TopComment | None = None


class CommentCreate(BaseModel):
    body: CommentBodyStr
    media_ids: list[str] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)
    # Set to reply to a comment (top-level or a reply) on the same post.
    reply_to_id: str | None = None


class CommentRead(BaseModel):
    id: str
    post_id: str
    author: ProfileSummary
    body: str
    media: list[MediaRead] = []
    like_count: int
    liked_by_me: bool
    created_at: datetime
    # Replies only: the thread's top-level comment, and whose comment was answered.
    parent_id: str | None = None
    reply_to: ProfileSummary | None = None


class ViewResult(BaseModel):
    view_count: int


class LikeResult(BaseModel):
    liked: bool
    like_count: int
