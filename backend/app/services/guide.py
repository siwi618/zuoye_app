"""「活动指南」 and the student council who runs it (migration 0034).

The council — the president and vice president (「现任鲦行知」 / 「现任副鲦行知」) and the members
(「小鲦」, added by the president) — sees every event; the president and vice create and delete
them, and anyone on the council edits them. Everyone else sees an event only on its open days
(Beijing dates), and gets 404 otherwise, as if it did not exist. Checked here — the tables have
no policies.

Who holds which office, the codes and the badges are kept by the database functions council_*,
so that each change happens in one step."""

import calendar
from datetime import UTC, date, datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.schemas.guide import (
    CouncilCode,
    CouncilPerson,
    CouncilRole,
    CouncilStatus,
    GuideConfig,
    GuideEventRead,
    GuideEventSummary,
    GuideEventWrite,
)
from app.services.moderation import ensure_allowed
from app.supabase_client import get_supabase

_TABLE = "guide_events"
# Sent as error details so the frontend can show a translated message.
COUNCIL_REQUIRED = "council_required"  # needs the president's or vice president's badge
HANDOVER_TOO_EARLY = "council_too_early"
ALREADY_ON_COUNCIL = "council_already"
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
    if not ids:
        return {}
    rows = (
        get_supabase().table("profiles").select("id,display_name,grade").in_("id", ids)
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
        .ilike("display_name", pattern).order("display_name").limit(_SEARCH_LIMIT)
        .execute().data
        or []
    )
    return [
        CouncilPerson(id=r["id"], display_name=r["display_name"], grade=r.get("grade"))
        for r in rows
    ]


def add_member(user_id: str, member_id: str) -> CouncilStatus:
    """The president adds a member (who gets 「小鲦」)."""
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


def _read(row: dict, role: CouncilRole | None) -> GuideEventRead:
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


def _row(payload: GuideEventWrite, user_id: str) -> dict:
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
    return _read(row, role)


def create_event(user_id: str, payload: GuideEventWrite) -> GuideEventRead:
    role = _require(user_id, _LEADERS)
    _check_text(payload)
    row = _row(payload, user_id) | {"created_by": user_id}
    inserted = get_supabase().table(_TABLE).insert(row).execute().data
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create event")
    return _read(inserted[0], role)


def update_event(user_id: str, event_id: str, payload: GuideEventWrite) -> GuideEventRead:
    role = _require(user_id, ("president", "vice", "member"))
    _check_text(payload)
    row = _row(payload, user_id) | {"updated_at": datetime.now(UTC).isoformat()}
    updated = get_supabase().table(_TABLE).update(row).eq("id", event_id).execute().data
    if not updated:
        raise _not_found()
    return _read(updated[0], role)


def delete_event(user_id: str, event_id: str) -> None:
    _require(user_id, _LEADERS)
    deleted = get_supabase().table(_TABLE).delete().eq("id", event_id).execute().data
    if not deleted:
        raise _not_found()
