"""「活动指南」 and the student council who runs it (migration 0034).

The council — the president and vice president (「现任鲦行知」 / 「现任副鲦行知」) and the members
(「小鲦」, added by the president) — sees every event; the president and vice create and delete
them, and anyone on the council edits them. Everyone else sees an event only on its open days
(Beijing dates), and gets 404 otherwise, as if it did not exist. Checked here — the tables have
no policies.

Who holds which office, the codes and the badges are kept by the database functions council_*,
so that each change happens in one step."""

import calendar
import secrets
from datetime import UTC, date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

from app.schemas.guide import (
    ActivityStar,
    CouncilCode,
    CouncilPerson,
    CouncilRole,
    CouncilStatus,
    GuideConfig,
    GuideEventRead,
    GuideEventSummary,
    GuideEventWrite,
    LikeState,
    StarredActivity,
)
from app.services.moderation import ensure_allowed
from app.supabase_client import get_supabase

_TABLE = "guide_events"
# Sent as error details so the frontend can show a translated message.
COUNCIL_REQUIRED = "council_required"  # needs the president's or vice president's badge
HANDOVER_TOO_EARLY = "council_too_early"
ALREADY_ON_COUNCIL = "council_already"
NOT_OPEN = "guide_not_open"  # likes only on the event's open days
NOT_ENDED = "guide_not_ended"  # stars only once the event has ended
_UNIQUE_VIOLATION = "23505"
_STARS_LIMIT = 200
_LIST_LIMIT = 200
_SEARCH_LIMIT = 8
# Keep in sync with council_term_length() and council_handover_after() in migration 0034.
_TERM_MONTHS = 12
_HANDOVER_MONTHS = 10
# Open days are Beijing dates (no daylight saving).
_BEIJING = timezone(timedelta(hours=8))
_LEADERS: tuple[CouncilRole, ...] = ("president", "vice")


def _today() -> date:
    return datetime.now(_BEIJING).date()


# ---- council -----------------------------------------------------------------------------------
def council_role(user_id: str) -> CouncilRole | None:
    """'president', 'vice', 'member' or None (the database ends a term whose year is up first)."""
    return get_supabase().rpc("council_role", {"p_user": user_id}).execute().data or None


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=COUNCIL_REQUIRED)


def _require(user_id: str, roles: tuple[CouncilRole, ...]) -> CouncilRole:
    role = council_role(user_id)
    if role not in roles:
        raise _forbidden()
    return role


def _add_months(d: datetime, months: int) -> datetime:
    """Like Postgres' timestamp + interval 'N months': the same day, or the month's last."""
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return d.replace(year=year, month=month, day=min(d.day, calendar.monthrange(year, month)[1]))


def _display(code: str) -> str:
    return f"CORAL-{code[:4]}-{code[4:]}"


def _people(ids: list[str]) -> dict[str, CouncilPerson]:
    """Names for council seats. Soft-deleted accounts (profiles.is_deleted) are left out, so they
    drop off the member list; their seat stays in council_terms, harmless since they can't sign in
    (a new 副会长码 replaces a deleted vice)."""
    if not ids:
        return {}
    rows = (
        get_supabase().table("profiles").select("id,display_name,grade").in_("id", ids)
        .eq("is_deleted", False)
        .execute().data
        or []
    )
    return {
        r["id"]: CouncilPerson(id=r["id"], display_name=r["display_name"], grade=r.get("grade"))
        for r in rows
    }


def council_status(user_id: str) -> CouncilStatus:
    role = council_role(user_id)
    if role is None:
        return CouncilStatus()
    db = get_supabase()
    terms = (
        db.table("council_terms").select("id,term,role,user_id,started_at")
        .is_("ended_at", "null").order("started_at").execute().data
        or []
    )
    mine = next(t for t in terms if t["user_id"] == user_id)
    started = datetime.fromisoformat(mine["started_at"])
    out = CouncilStatus(role=role, term=mine["term"], started_at=started)
    president = next((t for t in terms if t["role"] == "president"), None)
    if president:
        out.expires_at = _add_months(datetime.fromisoformat(president["started_at"]), _TERM_MONTHS)
    others = [t for t in terms if t["role"] != "president" and t["user_id"]]
    found = _people([t["user_id"] for t in others])
    out.members = [
        found[t["user_id"]] for t in others if t["role"] == "member" and t["user_id"] in found
    ]
    vice = next((t for t in others if t["role"] == "vice"), None)
    if vice and vice["user_id"] in found:
        out.vice = found[vice["user_id"]]
    if role != "president":
        return out

    out.handover_from = _add_months(started, _HANDOVER_MONTHS)

    codes = (
        db.table("council_codes").select("code,role,expires_at")
        .eq("term_id", mine["id"]).is_("redeemed_at", "null").is_("revoked_at", "null")
        .gt("expires_at", datetime.now(UTC).isoformat())
        .execute().data
        or []
    )
    for c in codes:
        setattr(
            out,
            f"{c['role']}_code",
            CouncilCode(code=_display(c["code"]), expires_at=c["expires_at"]),
        )
    return out


def new_code(user_id: str, role: str) -> CouncilStatus:
    """The president makes a 传承码 (president) or a 副会长码 (vice)."""
    rows = (
        get_supabase().rpc("council_new_code", {"p_user": user_id, "p_role": role})
        .execute().data
        or []
    )
    result = rows[0]["status"] if rows else "not_allowed"
    if result == "too_early":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=HANDOVER_TOO_EARLY)
    if result != "ok":
        raise _forbidden()
    return council_status(user_id)


def revoke_code(user_id: str, role: str) -> CouncilStatus:
    _require(user_id, ("president",))
    get_supabase().rpc("council_revoke_code", {"p_user": user_id, "p_role": role}).execute()
    return council_status(user_id)


def remove_vice(user_id: str) -> CouncilStatus:
    if not get_supabase().rpc("council_remove_vice", {"p_user": user_id}).execute().data:
        raise _forbidden()
    return council_status(user_id)


def search_users(user_id: str, query: str) -> list[CouncilPerson]:
    """People whose name contains `query`, for adding a member (president only)."""
    _require(user_id, ("president",))
    q = query.strip()
    if not q:
        return []
    # ilike's own wildcards in a name are matched literally.
    pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    rows = (
        get_supabase().table("profiles").select("id,display_name,grade")
        .ilike("display_name", pattern).eq("is_deleted", False)
        .order("display_name").limit(_SEARCH_LIMIT)
        .execute().data
        or []
    )
    return [
        CouncilPerson(id=r["id"], display_name=r["display_name"], grade=r.get("grade"))
        for r in rows
    ]


def add_member(user_id: str, member_id: str) -> CouncilStatus:
    """The president adds a member (who gets 「小鲦」). A soft-deleted account counts as unknown."""
    deleted = (
        get_supabase().table("profiles").select("id").eq("id", member_id).eq("is_deleted", True)
        .execute().data
    )
    if deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    result = (
        get_supabase().rpc("council_add_member", {"p_user": user_id, "p_member": member_id})
        .execute().data
    )
    if result == "unknown":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if result == "already":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_ON_COUNCIL)
    if result != "ok":
        raise _forbidden()
    return council_status(user_id)


def leave(user_id: str) -> CouncilStatus:
    """A member leaves the council (members stay across terms until they leave or are removed)."""
    if not get_supabase().rpc("council_leave", {"p_user": user_id}).execute().data:
        raise _forbidden()
    return council_status(user_id)


def remove_member(user_id: str, member_id: str) -> CouncilStatus:
    ok = (
        get_supabase().rpc("council_remove_member", {"p_user": user_id, "p_member": member_id})
        .execute().data
    )
    if not ok:
        raise _forbidden()
    return council_status(user_id)


# ---- events ------------------------------------------------------------------------------------
def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")


def _is_open(row: dict, today: date) -> bool:
    lo, hi = row.get("open_from"), row.get("open_to")
    return bool(lo and hi) and date.fromisoformat(lo) <= today <= date.fromisoformat(hi)


def _ended(row: dict, today: date) -> bool:
    hi = row.get("open_to")
    return bool(hi) and date.fromisoformat(hi) < today


def _award(row: dict, today: date) -> None:
    """Once an event has ended its most-liked activity gets a star (guide_award_stars), the first
    time anyone looks after that."""
    if _ended(row, today) and not row.get("stars_awarded"):
        get_supabase().rpc("guide_award_stars", {}).execute()


def _read(row: dict, role: CouncilRole | None, user_id: str) -> GuideEventRead:
    db = get_supabase()
    today = _today()
    _award(row, today)
    counts = db.rpc("guide_like_counts", {"p_event": row["id"]}).execute().data or []
    liked = (
        db.table("guide_likes").select("activity_id")
        .eq("event_id", row["id"]).eq("user_id", user_id).execute().data
        or []
    )
    stars = (
        db.table("guide_stars").select("id,activity_id,note,auto")
        .eq("event_id", row["id"]).execute().data
        or []
    )
    return GuideEventRead(
        id=row["id"],
        title=row["title"],
        subtitle=row["subtitle"],
        config=GuideConfig.model_validate(row.get("config") or {}),
        updated_at=row["updated_at"],
        open_from=row.get("open_from"),
        open_to=row.get("open_to"),
        can_edit=role is not None,
        can_manage=role in _LEADERS,
        likes={c["activity_id"]: c["n"] for c in counts},
        liked=[r["activity_id"] for r in liked],
        can_like=_is_open(row, today),
        stars={
            r["activity_id"]: ActivityStar(id=r["id"], note=r["note"], auto=r["auto"])
            for r in stars
        },
        can_star=role is not None and _ended(row, today),
    )


def _check_text(payload: GuideEventWrite) -> None:
    """The title, subtitle and activity names are shown to everyone with the link: run them past
    moderation like other user text (422 content_rejected when flagged)."""
    ensure_allowed(
        payload.title,
        payload.subtitle,
        *(a.name for a in payload.config.activities),
        *(a.time for a in payload.config.activities),
    )


def _give_ids(payload: GuideEventWrite) -> None:
    """Every activity keeps the id it came with (likes and stars point at it); a new one, or a
    copy of another's, gets a fresh one."""
    seen: set[str] = set()
    for a in payload.config.activities:
        if not a.id or a.id in seen:
            a.id = secrets.token_hex(4)
        seen.add(a.id)


def _row(payload: GuideEventWrite, user_id: str) -> dict:
    _give_ids(payload)
    return {
        "title": payload.title,
        "subtitle": payload.subtitle,
        "config": payload.config.model_dump(mode="json"),
        "open_from": payload.open_from.isoformat() if payload.open_from else None,
        "open_to": payload.open_to.isoformat() if payload.open_to else None,
        "updated_by": user_id,
    }


def _fetch(event_id: str) -> dict:
    rows = get_supabase().table(_TABLE).select("*").eq("id", event_id).limit(1).execute().data
    if not rows:
        raise _not_found()
    return rows[0]


def list_events(user_id: str) -> list[GuideEventSummary]:
    """Every event for the council; for everyone else only those open today."""
    query = (
        get_supabase().table(_TABLE).select("id,title,subtitle,config,updated_at,open_from,open_to")
    )
    if council_role(user_id) is None:
        today = _today().isoformat()
        query = query.lte("open_from", today).gte("open_to", today)
    rows = query.order("updated_at", desc=True).limit(_LIST_LIMIT).execute().data or []
    return [
        GuideEventSummary(
            id=r["id"],
            title=r["title"],
            subtitle=r["subtitle"],
            activity_count=len((r.get("config") or {}).get("activities") or []),
            updated_at=r["updated_at"],
            open_from=r.get("open_from"),
            open_to=r.get("open_to"),
        )
        for r in rows
    ]


def get_event(user_id: str, event_id: str) -> GuideEventRead:
    row = _fetch(event_id)
    role = council_role(user_id)
    if role is None and not _is_open(row, _today()):
        raise _not_found()
    return _read(row, role, user_id)


def create_event(user_id: str, payload: GuideEventWrite) -> GuideEventRead:
    role = _require(user_id, _LEADERS)
    _check_text(payload)
    row = _row(payload, user_id) | {"created_by": user_id}
    inserted = get_supabase().table(_TABLE).insert(row).execute().data
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create event")
    return _read(inserted[0], role, user_id)


def update_event(user_id: str, event_id: str, payload: GuideEventWrite) -> GuideEventRead:
    role = _require(user_id, ("president", "vice", "member"))
    _check_text(payload)
    row = _row(payload, user_id) | {"updated_at": datetime.now(UTC).isoformat()}
    updated = get_supabase().table(_TABLE).update(row).eq("id", event_id).execute().data
    if not updated:
        raise _not_found()
    return _read(updated[0], role, user_id)


def delete_event(user_id: str, event_id: str) -> None:
    _require(user_id, _LEADERS)
    deleted = get_supabase().table(_TABLE).delete().eq("id", event_id).execute().data
    if not deleted:
        raise _not_found()


# ---- likes and stars ---------------------------------------------------------------------------
def _activity(row: dict, activity_id: str) -> dict:
    for a in (row.get("config") or {}).get("activities") or []:
        if a.get("id") == activity_id:
            return a
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")


def toggle_like(user_id: str, event_id: str, activity_id: str) -> LikeState:
    """Likes or unlikes an activity, on the event's open days only (403 guide_not_open). Anyone who
    can see the event then — the council too."""
    row = _fetch(event_id)
    today = _today()
    if not _is_open(row, today):
        if council_role(user_id) is None:
            raise _not_found()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_OPEN)
    _activity(row, activity_id)
    db = get_supabase()

    key = {"event_id": event_id, "activity_id": activity_id, "user_id": user_id}
    existing = (
        db.table("guide_likes").select("user_id")
        .eq("event_id", event_id).eq("activity_id", activity_id).eq("user_id", user_id)
        .limit(1).execute().data
    )
    if existing:
        db.table("guide_likes").delete().eq("event_id", event_id).eq(
            "activity_id", activity_id
        ).eq("user_id", user_id).execute()
    else:
        try:
            db.table("guide_likes").insert(key).execute()
        except APIError as exc:
            if exc.code != _UNIQUE_VIOLATION:
                raise
    count = (
        db.table("guide_likes").select("user_id", count="exact")
        .eq("event_id", event_id).eq("activity_id", activity_id).limit(1).execute().count
    )
    return LikeState(liked=not existing, count=count or 0)


def star(user_id: str, event_id: str, activity_id: str, note: str) -> ActivityStar:
    """Anyone on the council stars an activity of an event that has ended (409 guide_not_ended),
    with an optional note; starring it again changes the note."""
    _require(user_id, ("president", "vice", "member"))
    row = _fetch(event_id)
    if not _ended(row, _today()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=NOT_ENDED)
    act = _activity(row, activity_id)
    ensure_allowed(note)
    db = get_supabase()
    existing = (
        db.table("guide_stars").select("id")
        .eq("event_id", event_id).eq("activity_id", activity_id).limit(1).execute().data
    )
    if existing:
        return _set_note(existing[0]["id"], note)
    try:
        inserted = db.table("guide_stars").insert({
            "event_id": event_id,
            "activity_id": activity_id,
            "event_title": row["title"],
            "event_day": row.get("open_from"),
            "name": act.get("name") or "",
            "place": act.get("place") or "",
            "note": note,
            "starred_by": user_id,
        }).execute().data
    except APIError as exc:
        if exc.code != _UNIQUE_VIOLATION:
            raise
        return star(user_id, event_id, activity_id, note)
    r = inserted[0]
    return ActivityStar(id=r["id"], note=r["note"], auto=r["auto"])


def _set_note(star_id: int, note: str) -> ActivityStar:
    updated = (
        get_supabase().table("guide_stars")
        .update({"note": note, "updated_at": datetime.now(UTC).isoformat()})
        .eq("id", star_id).execute().data
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Star not found")
    r = updated[0]
    return ActivityStar(id=r["id"], note=r["note"], auto=r["auto"])


def update_star(user_id: str, star_id: int, note: str) -> ActivityStar:
    """Anyone on the council changes a star's note (an auto star's too)."""
    _require(user_id, ("president", "vice", "member"))
    ensure_allowed(note)
    return _set_note(star_id, note)


def unstar(user_id: str, star_id: int) -> None:
    """Anyone on the council takes a star away (an auto star's too; it isn't given again)."""
    _require(user_id, ("president", "vice", "member"))
    deleted = get_supabase().table("guide_stars").delete().eq("id", star_id).execute().data
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Star not found")


def list_stars(user_id: str) -> list[StarredActivity]:
    """星标活动 for the council, newest event first (giving the ended events' stars first)."""
    _require(user_id, ("president", "vice", "member"))
    db = get_supabase()
    db.rpc("guide_award_stars", {}).execute()
    rows = db.rpc("guide_star_list", {"p_limit": _STARS_LIMIT}).execute().data or []
    return [StarredActivity.model_validate(r) for r in rows]
