from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

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
    TopComment,
)
from app.schemas.request import ProfileSummary
from app.schemas.media import MediaRead
from app.services import media as media_svc
from app.services.moderation import ensure_allowed
from app.supabase_client import get_supabase

_RANGE_DELTAS = {
    TimeRange.day: timedelta(days=1),
    TimeRange.week: timedelta(days=7),
    TimeRange.month: timedelta(days=30),
}

# Postgres unique_violation — a concurrent like already inserted the row.
_UNIQUE_VIOLATION = "23505"


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


def _deleted_user_ids() -> list[str]:
    """Soft-deleted users — their posts and comments are hidden."""
    rows = (
        get_supabase()
        .table("profiles")
        .select("id")
        .eq("is_deleted", True)
        .execute()
        .data
        or []
    )
    return [r["id"] for r in rows]


def _liked_ids(table: str, key: str, user_id: str, ids: list[str]) -> set[str]:
    if not ids:
        return set()
    rows = (
        get_supabase()
        .table(table)
        .select(key)
        .eq("user_id", user_id)
        .in_(key, ids)
        .execute()
        .data
        or []
    )
    return {r[key] for r in rows}


def _hydrate_post(
    row: dict,
    profiles: dict[str, dict],
    liked: set[str],
    media_by_id: dict[str, MediaRead],
    top_comment: TopComment | None = None,
) -> PostRead:
    return PostRead(
        id=row["id"],
        author=ProfileSummary(**profiles[row["author_id"]]),
        title=row["title"],
        body=row["body"],
        media=media_svc.attached(row, media_by_id),
        tag=row["tag"],
        view_count=row["view_count"],
        like_count=row["like_count"],
        comment_count=row["comment_count"],
        liked_by_me=row["id"] in liked,
        created_at=row["created_at"],
        top_comment=top_comment,
    )


def _top_comments(post_ids: list[str], deleted: list[str]) -> dict[str, TopComment]:
    """Most-liked visible comment per post (ties: earliest), same order as CommentSort.top."""
    if not post_ids:
        return {}
    query = (
        get_supabase()
        .table("forum_comments")
        .select("post_id, author_id, body, like_count")
        .in_("post_id", post_ids)
        .is_("parent_id", "null")
        .eq("moderation_flagged", False)
    )
    if deleted:
        query = query.not_.in_("author_id", deleted)
    rows = query.order("like_count", desc=True).order("created_at").execute().data or []

    best: dict[str, dict] = {}
    for r in rows:
        best.setdefault(r["post_id"], r)
    profiles = _fetch_profiles({r["author_id"] for r in best.values()})
    return {
        post_id: TopComment(
            author_name=profiles[r["author_id"]]["display_name"],
            body=r["body"],
            like_count=r["like_count"],
        )
        for post_id, r in best.items()
        if r["author_id"] in profiles
    }


def _hydrate_comment(
    row: dict, profiles: dict[str, dict], liked: set[str], media_by_id: dict[str, MediaRead]
) -> CommentRead:
    return CommentRead(
        id=row["id"],
        post_id=row["post_id"],
        author=ProfileSummary(**profiles[row["author_id"]]),
        body=row["body"],
        media=media_svc.attached(row, media_by_id),
        like_count=row["like_count"],
        liked_by_me=row["id"] in liked,
        created_at=row["created_at"],
        parent_id=row.get("parent_id"),
        reply_to=(
            ProfileSummary(**profiles[row["reply_to_user_id"]])
            if row.get("reply_to_user_id") in profiles
            else None
        ),
    )


def _get_post_row(post_id: str) -> dict:
    rows = (
        get_supabase()
        .table("forum_posts")
        .select("*")
        .eq("id", post_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    row = rows[0]
    if row["moderation_flagged"] or row["author_id"] in _deleted_user_ids():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return row


def _get_comment_row(comment_id: str) -> dict:
    rows = (
        get_supabase()
        .table("forum_comments")
        .select("*")
        .eq("id", comment_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return rows[0]


# ---------------------------------------------------------------- posts


def list_posts(
    user_id: str,
    *,
    tag: ForumTag | None = None,
    sort: PostSort = PostSort.hot,
    time_range: TimeRange = TimeRange.all,
    limit: int = 50,
) -> list[PostRead]:
    deleted = _deleted_user_ids()

    def base():
        query = get_supabase().table("forum_posts").select("*").eq("moderation_flagged", False)
        if tag:
            query = query.eq("tag", tag.value)
        if time_range in _RANGE_DELTAS:
            since = datetime.now(timezone.utc) - _RANGE_DELTAS[time_range]
            query = query.gte("created_at", since.isoformat())
        if deleted:
            query = query.not_.in_("author_id", deleted)
        return query

    if sort == PostSort.mine:
        mine = base().eq("author_id", user_id).order("created_at", desc=True).limit(limit)
        rows = mine.execute().data or []
        if len(rows) < limit:
            others = (
                base()
                .neq("author_id", user_id)
                .order("view_count", desc=True)
                .order("created_at", desc=True)
                .limit(limit - len(rows))
            )
            rows += others.execute().data or []
    else:
        query = base()
        if sort == PostSort.hot:
            query = query.order("view_count", desc=True)
        rows = query.order("created_at", desc=True).limit(limit).execute().data or []

    if not rows:
        return []

    post_ids = [r["id"] for r in rows]
    profiles = _fetch_profiles({r["author_id"] for r in rows})
    liked = _liked_ids("forum_post_likes", "post_id", user_id, post_ids)
    media_by_id = media_svc.fetch(media_svc.all_ids(rows))
    top = _top_comments(post_ids, deleted)
    return [_hydrate_post(r, profiles, liked, media_by_id, top.get(r["id"])) for r in rows]


def get_post(user_id: str, post_id: str) -> PostRead:
    row = _get_post_row(post_id)
    profiles = _fetch_profiles({row["author_id"]})
    liked = _liked_ids("forum_post_likes", "post_id", user_id, [row["id"]])
    return _hydrate_post(row, profiles, liked, media_svc.fetch(media_svc.all_ids([row])))


def create_post(user_id: str, payload: PostCreate) -> PostRead:
    moderated = ensure_allowed(payload.title, payload.body)
    media_ids = media_svc.validate_attachments(user_id, payload.media_ids)
    inserted = (
        get_supabase()
        .table("forum_posts")
        .insert({
            "author_id": user_id,
            "title": payload.title,
            "body": payload.body,
            "tag": payload.tag.value,
            "media_ids": media_ids,
            "moderated": moderated,
        })
        .execute()
        .data
    )
    row = (inserted or [None])[0]
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create post",
        )
    profiles = _fetch_profiles({user_id})
    return _hydrate_post(row, profiles, set(), media_svc.fetch(set(media_ids)))


def delete_post(user_id: str, post_id: str) -> None:
    row = _get_post_row(post_id)
    if row["author_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author can delete this post",
        )
    comments = (
        get_supabase().table("forum_comments").select("media_ids").eq("post_id", post_id)
        .execute().data
        or []
    )
    get_supabase().table("forum_posts").delete().eq("id", post_id).execute()
    media_svc.delete(list(media_svc.all_ids([row, *comments])))


def record_view(post_id: str) -> int:
    """Count a view and return the post's new view count."""
    _get_post_row(post_id)
    get_supabase().rpc("forum_increment_view", {"p_post_id": post_id}).execute()
    return _get_post_row(post_id)["view_count"]


def _toggle_like(table: str, key: str, target_id: str, user_id: str) -> bool:
    """Flip the caller's like on target_id; return whether it is now liked."""
    existing = (
        get_supabase()
        .table(table)
        .select(key)
        .eq(key, target_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        get_supabase().table(table).delete().eq(key, target_id).eq("user_id", user_id).execute()
        return False
    try:
        get_supabase().table(table).insert({key: target_id, "user_id": user_id}).execute()
    except APIError as exc:
        if exc.code != _UNIQUE_VIOLATION:
            raise
    return True


def toggle_post_like(user_id: str, post_id: str) -> LikeResult:
    _get_post_row(post_id)
    liked = _toggle_like("forum_post_likes", "post_id", post_id, user_id)
    return LikeResult(liked=liked, like_count=_get_post_row(post_id)["like_count"])


# ---------------------------------------------------------------- comments


def list_comments(user_id: str, post_id: str, *, sort: CommentSort = CommentSort.top) -> list[CommentRead]:
    _get_post_row(post_id)
    query = (
        get_supabase()
        .table("forum_comments")
        .select("*")
        .eq("post_id", post_id)
        .eq("moderation_flagged", False)
    )
    deleted = _deleted_user_ids()
    if deleted:
        query = query.not_.in_("author_id", deleted)
    if sort == CommentSort.top:
        query = query.order("like_count", desc=True).order("created_at")
    else:
        query = query.order("created_at", desc=True)

    rows = query.execute().data or []
    # A reply is hidden along with its thread's top-level comment.
    visible_tops = {r["id"] for r in rows if not r.get("parent_id")}
    rows = [r for r in rows if not r.get("parent_id") or r["parent_id"] in visible_tops]
    if not rows:
        return []

    user_ids = {r["author_id"] for r in rows} | {
        r["reply_to_user_id"] for r in rows if r.get("reply_to_user_id")
    }
    profiles = _fetch_profiles(user_ids)
    liked = _liked_ids("forum_comment_likes", "comment_id", user_id, [r["id"] for r in rows])
    media_by_id = media_svc.fetch(media_svc.all_ids(rows))
    return [_hydrate_comment(r, profiles, liked, media_by_id) for r in rows]


def create_comment(user_id: str, post_id: str, payload: CommentCreate) -> CommentRead:
    _get_post_row(post_id)
    parent_id = reply_to_user_id = None
    if payload.reply_to_id:
        target = _get_comment_row(payload.reply_to_id)
        if target["post_id"] != post_id or target["moderation_flagged"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        # Replies to a reply join the same thread, under its top-level comment.
        parent_id = target.get("parent_id") or target["id"]
        reply_to_user_id = target["author_id"]
    moderated = ensure_allowed(payload.body)
    media_ids = media_svc.validate_attachments(user_id, payload.media_ids)
    inserted = (
        get_supabase()
        .table("forum_comments")
        .insert({
            "post_id": post_id,
            "author_id": user_id,
            "body": payload.body,
            "media_ids": media_ids,
            "moderated": moderated,
            "parent_id": parent_id,
            "reply_to_user_id": reply_to_user_id,
        })
        .execute()
        .data
    )
    row = (inserted or [None])[0]
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create comment",
        )
    profiles = _fetch_profiles({user_id} | ({reply_to_user_id} if reply_to_user_id else set()))
    return _hydrate_comment(row, profiles, set(), media_svc.fetch(set(media_ids)))


def delete_comment(user_id: str, comment_id: str) -> None:
    row = _get_comment_row(comment_id)
    if row["author_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author can delete this comment",
        )
    db = get_supabase()
    # Replies are removed by ON DELETE CASCADE; their attachments need deleting too.
    replies = db.table("forum_comments").select("media_ids").eq("parent_id", comment_id).execute().data or []
    db.table("forum_comments").delete().eq("id", comment_id).execute()
    media_svc.delete([m for r in [row, *replies] for m in (r.get("media_ids") or [])])


def toggle_comment_like(user_id: str, comment_id: str) -> LikeResult:
    _get_comment_row(comment_id)
    liked = _toggle_like("forum_comment_likes", "comment_id", comment_id, user_id)
    return LikeResult(liked=liked, like_count=_get_comment_row(comment_id)["like_count"])
