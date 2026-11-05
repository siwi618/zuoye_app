from collections import Counter

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

from app.schemas.literature import (
    AnalysisCreate,
    AnalysisRead,
    HighlightRead,
    OverviewRead,
    QuoteCreate,
    QuoteRead,
    TagRead,
    WorkLink,
    WorkRead,
)
from app.schemas.request import ProfileSummary
from app.services.forum import _deleted_user_ids, _fetch_profiles
from app.services.moderation import CONTENT_REJECTED, ensure_allowed
from app.supabase_client import get_supabase

# Sent as error details so the frontend can show a translated message.
QUOTE_CITED = "quote_cited"
INVALID_ANALYSIS = "invalid_analysis"

# Postgres unique_violation — another request created the same tag first.
_UNIQUE_VIOLATION = "23505"

_MAX_QUOTES = 500
_MAX_ANALYSES = 200


def _reject(detail: str, code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def _visible_analyses(
    deleted: list[str], work_key: str | None = None, limit: int = _MAX_ANALYSES
) -> list[dict]:
    query = (
        get_supabase()
        .table("lit_analyses")
        .select("*")
        .eq("moderation_flagged", False)
    )
    if work_key:
        query = query.eq("work_key", work_key)
    if deleted:
        query = query.not_.in_("author_id", deleted)
    return query.order("created_at", desc=True).limit(limit).execute().data or []


def _rows_for(table: str, analysis_ids: list[str], order: str | None = None) -> list[dict]:
    if not analysis_ids:
        return []
    query = get_supabase().table(table).select("*").in_("analysis_id", analysis_ids)
    if order:
        query = query.order(order)
    return query.execute().data or []


def _visible_tags(tag_ids: set[str] | None = None) -> dict[str, dict]:
    query = get_supabase().table("lit_tags").select("id, name").eq("moderation_flagged", False)
    if tag_ids is not None:
        if not tag_ids:
            return {}
        query = query.in_("id", list(tag_ids))
    return {r["id"]: r for r in (query.execute().data or [])}


def _usage(deleted: list[str]) -> list[tuple[str, str]]:
    """(work_key, tag_id) for every tag on every visible analysis, in all works.

    Counted in Python: fine while there are a few hundred analyses; move into a
    database view once the tool is busy.
    """
    analyses = {r["id"]: r["work_key"] for r in _visible_analyses(deleted, limit=1000)}
    links = _rows_for("lit_analysis_tags", list(analyses))
    return [(analyses[r["analysis_id"]], r["tag_id"]) for r in links]


# ---------------------------------------------------------------- reading


def get_work(work_key: str) -> WorkRead:
    db = get_supabase()
    deleted = _deleted_user_ids()

    quotes_q = db.table("lit_quotes").select("*").eq("work_key", work_key).eq(
        "moderation_flagged", False
    )
    if deleted:
        quotes_q = quotes_q.not_.in_("author_id", deleted)
    quotes = (
        quotes_q.order("page_start").order("page_end").order("created_at")
        .limit(_MAX_QUOTES).execute().data
        or []
    )
    quote_ids = {q["id"] for q in quotes}

    analyses = _visible_analyses(deleted, work_key)
    analysis_ids = [a["id"] for a in analyses]
    covered = _rows_for("lit_analysis_quotes", analysis_ids, order="position")
    highlights = _rows_for("lit_highlights", analysis_ids, order="number")
    tag_links = _rows_for("lit_analysis_tags", analysis_ids)
    tags = _visible_tags({r["tag_id"] for r in tag_links})

    counts = Counter(r["tag_id"] for r in tag_links if r["tag_id"] in tags)
    cited = Counter(r["quote_id"] for r in covered)
    profiles = _fetch_profiles({q["author_id"] for q in quotes} | {a["author_id"] for a in analyses})

    def tag_read(tag_id: str) -> TagRead:
        return TagRead(id=tag_id, name=tags[tag_id]["name"], count=counts[tag_id])

    by_analysis: dict[str, dict[str, list]] = {
        a: {"quotes": [], "highlights": [], "tags": []} for a in analysis_ids
    }
    for r in covered:
        # A quote taken down by moderation drops out of the analyses citing it.
        if r["quote_id"] in quote_ids:
            by_analysis[r["analysis_id"]]["quotes"].append(r["quote_id"])
    for r in highlights:
        if r["quote_id"] in quote_ids:
            by_analysis[r["analysis_id"]]["highlights"].append(
                HighlightRead(
                    quote_id=r["quote_id"], number=r["number"],
                    start=r["start_offset"], end=r["end_offset"],
                )
            )
    for r in tag_links:
        if r["tag_id"] in tags:
            by_analysis[r["analysis_id"]]["tags"].append(tag_read(r["tag_id"]))

    return WorkRead(
        work_key=work_key,
        quotes=[
            QuoteRead(
                id=q["id"], work_key=q["work_key"], author=ProfileSummary(**profiles[q["author_id"]]),
                body=q["body"], page_start=q["page_start"], page_end=q["page_end"],
                cited_count=cited[q["id"]], created_at=q["created_at"],
            )
            for q in quotes
            if q["author_id"] in profiles
        ],
        analyses=[
            AnalysisRead(
                id=a["id"], work_key=a["work_key"], author=ProfileSummary(**profiles[a["author_id"]]),
                body=a["body"], quote_ids=by_analysis[a["id"]]["quotes"],
                highlights=by_analysis[a["id"]]["highlights"],
                tags=sorted(by_analysis[a["id"]]["tags"], key=lambda t: -t.count),
                created_at=a["created_at"],
            )
            for a in analyses
            if a["author_id"] in profiles
        ],
        tags=sorted((tag_read(t) for t in counts), key=lambda t: (-t.count, t.name)),
    )


def list_tags(query: str | None, limit: int) -> list[TagRead]:
    """Every tag for the tag picker, most used (in all works) first."""
    counts = Counter(tag_id for _, tag_id in _usage(_deleted_user_ids()))
    tags = _visible_tags()
    q = (query or "").strip().lower().lstrip("#")
    found = [
        TagRead(id=t["id"], name=t["name"], count=counts[t["id"]])
        for t in tags.values()
        if not q or q in t["name"].lower()
    ]
    found.sort(key=lambda t: (-t.count, t.name))
    return found[:limit]


def overview(limit: int) -> OverviewRead:
    usage = _usage(_deleted_user_ids())
    tags = _visible_tags({tag_id for _, tag_id in usage})
    totals = Counter(tag_id for _, tag_id in usage if tag_id in tags)
    top = sorted(totals, key=lambda t: (-totals[t], tags[t]["name"]))[:limit]
    per_work = Counter(pair for pair in usage if pair[1] in top)
    return OverviewRead(
        tags=[TagRead(id=t, name=tags[t]["name"], count=totals[t]) for t in top],
        links=[
            WorkLink(work_key=w, tag_id=t, count=n) for (w, t), n in sorted(per_work.items())
        ],
    )


# ---------------------------------------------------------------- quotes


def _quote_row(quote_id: str) -> dict:
    rows = (
        get_supabase().table("lit_quotes").select("*").eq("id", quote_id).limit(1)
        .execute().data
        or []
    )
    if not rows or rows[0]["moderation_flagged"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return rows[0]


def create_quote(user_id: str, work_key: str, payload: QuoteCreate) -> QuoteRead:
    moderated = ensure_allowed(payload.body)
    inserted = (
        get_supabase()
        .table("lit_quotes")
        .insert({
            "work_key": work_key,
            "author_id": user_id,
            "body": payload.body,
            "page_start": payload.page_start,
            "page_end": payload.page_end,
            "moderated": moderated,
        })
        .execute()
        .data
    )
    row = (inserted or [None])[0]
    if not row:
        raise _reject("Failed to create quote", status.HTTP_500_INTERNAL_SERVER_ERROR)
    profiles = _fetch_profiles({user_id})
    return QuoteRead(
        id=row["id"], work_key=work_key, author=ProfileSummary(**profiles[user_id]),
        body=row["body"], page_start=row["page_start"], page_end=row["page_end"],
        cited_count=0, created_at=row["created_at"],
    )


def delete_quote(user_id: str, quote_id: str) -> None:
    row = _quote_row(quote_id)
    if row["author_id"] != user_id:
        raise _reject("Only the author can delete this quote", status.HTTP_403_FORBIDDEN)
    citing = (
        get_supabase().table("lit_analysis_quotes").select("analysis_id")
        .eq("quote_id", quote_id).limit(1).execute().data
    )
    if citing:
        raise _reject(QUOTE_CITED, status.HTTP_409_CONFLICT)
    get_supabase().table("lit_quotes").delete().eq("id", quote_id).execute()


# ---------------------------------------------------------------- analyses


def _find_tag(name: str) -> dict | None:
    # ilike without wildcards = equality ignoring case, matching the unique index on lower(name).
    pattern = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = (
        get_supabase().table("lit_tags").select("id, name, moderation_flagged")
        .ilike("name", pattern).limit(1).execute().data
        or []
    )
    return rows[0] if rows else None


def _resolve_tags(user_id: str, names: list[str], moderated: bool) -> list[dict]:
    """Existing tags by name (ignoring case), creating the missing ones."""
    tags: list[dict] = []
    for name in names:
        tag = _find_tag(name)
        if not tag:
            try:
                created = (
                    get_supabase()
                    .table("lit_tags")
                    .insert({"name": name, "created_by": user_id, "moderated": moderated})
                    .execute()
                    .data
                )
                tag = (created or [None])[0]
            except APIError as exc:
                if exc.code != _UNIQUE_VIOLATION:
                    raise
                tag = _find_tag(name)
        if not tag or tag.get("moderation_flagged"):
            raise _reject(CONTENT_REJECTED)
        tags.append(tag)
    return tags


def _check_highlights(payload: AnalysisCreate, quotes: dict[str, dict]) -> None:
    """Offsets count characters (code points), as Python's len() does; no two overlap."""
    numbers = [h.number for h in payload.highlights]
    if len(set(numbers)) != len(numbers):
        raise _reject(INVALID_ANALYSIS)
    spans: dict[str, list[tuple[int, int]]] = {}
    for h in payload.highlights:
        quote = quotes.get(h.quote_id)
        if not quote or h.end <= h.start or h.end > len(quote["body"]):
            raise _reject(INVALID_ANALYSIS)
        spans.setdefault(h.quote_id, []).append((h.start, h.end))
    for ranges in spans.values():
        ranges.sort()
        if any(b[0] < a[1] for a, b in zip(ranges, ranges[1:], strict=False)):
            raise _reject(INVALID_ANALYSIS)


def create_analysis(user_id: str, work_key: str, payload: AnalysisCreate) -> AnalysisRead:
    quote_ids = list(dict.fromkeys(payload.quote_ids))
    rows = (
        get_supabase().table("lit_quotes").select("id, work_key, body, moderation_flagged")
        .in_("id", quote_ids).execute().data
        or []
    )
    quotes = {
        r["id"]: r for r in rows if r["work_key"] == work_key and not r["moderation_flagged"]
    }
    if len(quotes) != len(quote_ids):
        raise _reject(INVALID_ANALYSIS)
    _check_highlights(payload, quotes)

    names: list[str] = []
    for name in payload.tags:
        if name.lower() not in {n.lower() for n in names}:
            names.append(name)
    moderated = ensure_allowed(payload.body, " ".join(names))
    tags = _resolve_tags(user_id, names, moderated)

    db = get_supabase()
    inserted = (
        db.table("lit_analyses")
        .insert({
            "work_key": work_key, "author_id": user_id, "body": payload.body,
            "moderated": moderated,
        })
        .execute()
        .data
    )
    row = (inserted or [None])[0]
    if not row:
        raise _reject("Failed to create analysis", status.HTTP_500_INTERNAL_SERVER_ERROR)
    analysis_id = row["id"]
    try:
        db.table("lit_analysis_quotes").insert([
            {"analysis_id": analysis_id, "quote_id": q, "position": i}
            for i, q in enumerate(quote_ids)
        ]).execute()
        if payload.highlights:
            db.table("lit_highlights").insert([
                {
                    "analysis_id": analysis_id, "quote_id": h.quote_id, "number": h.number,
                    "start_offset": h.start, "end_offset": h.end,
                }
                for h in payload.highlights
            ]).execute()
        db.table("lit_analysis_tags").insert([
            {"analysis_id": analysis_id, "tag_id": t["id"]} for t in tags
        ]).execute()
    except Exception:
        db.table("lit_analyses").delete().eq("id", analysis_id).execute()
        raise

    profiles = _fetch_profiles({user_id})
    return AnalysisRead(
        id=analysis_id, work_key=work_key, author=ProfileSummary(**profiles[user_id]),
        body=row["body"], quote_ids=quote_ids,
        highlights=[HighlightRead(**h.model_dump()) for h in payload.highlights],
        tags=[TagRead(id=t["id"], name=t["name"], count=0) for t in tags],
        created_at=row["created_at"],
    )


def delete_analysis(user_id: str, analysis_id: str) -> None:
    rows = (
        get_supabase().table("lit_analyses").select("author_id").eq("id", analysis_id)
        .limit(1).execute().data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    if rows[0]["author_id"] != user_id:
        raise _reject("Only the author can delete this analysis", status.HTTP_403_FORBIDDEN)
    get_supabase().table("lit_analyses").delete().eq("id", analysis_id).execute()
