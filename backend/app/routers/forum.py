from fastapi import APIRouter, Query

from app.deps import CurrentUserDep
from app.schemas.forum import (
    CommentCreate,
    CommentRead,
    CommentSort,
    ForumTag,
    LikeResult,
    PostCreate,
    PostRead,
    PostSort,
    TimeRange,
)
from app.services import forum as svc

router = APIRouter(prefix="/forum", tags=["forum"])


@router.get("/posts", response_model=list[PostRead])
def list_posts(
    user: CurrentUserDep,
    tag: ForumTag | None = Query(default=None),
    sort: PostSort = Query(default=PostSort.hot),
    time_range: TimeRange = Query(default=TimeRange.all, alias="range"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[PostRead]:
    return svc.list_posts(user.id, tag=tag, sort=sort, time_range=time_range, limit=limit)


@router.post("/posts", response_model=PostRead, status_code=201)
def create_post(user: CurrentUserDep, payload: PostCreate) -> PostRead:
    return svc.create_post(user.id, payload)


@router.get("/posts/{post_id}", response_model=PostRead)
def get_post(user: CurrentUserDep, post_id: str) -> PostRead:
    return svc.get_post(user.id, post_id)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(user: CurrentUserDep, post_id: str) -> None:
    svc.delete_post(user.id, post_id)


@router.post("/posts/{post_id}/view", status_code=204)
def record_view(user: CurrentUserDep, post_id: str) -> None:
    _ = user
    svc.record_view(post_id)


@router.post("/posts/{post_id}/like", response_model=LikeResult)
def toggle_post_like(user: CurrentUserDep, post_id: str) -> LikeResult:
    return svc.toggle_post_like(user.id, post_id)


@router.get("/posts/{post_id}/comments", response_model=list[CommentRead])
def list_comments(
    user: CurrentUserDep,
    post_id: str,
    sort: CommentSort = Query(default=CommentSort.top),
) -> list[CommentRead]:
    return svc.list_comments(user.id, post_id, sort=sort)


@router.post("/posts/{post_id}/comments", response_model=CommentRead, status_code=201)
def create_comment(user: CurrentUserDep, post_id: str, payload: CommentCreate) -> CommentRead:
    return svc.create_comment(user.id, post_id, payload)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(user: CurrentUserDep, comment_id: str) -> None:
    svc.delete_comment(user.id, comment_id)


@router.post("/comments/{comment_id}/like", response_model=LikeResult)
def toggle_comment_like(user: CurrentUserDep, comment_id: str) -> LikeResult:
    return svc.toggle_comment_like(user.id, comment_id)
