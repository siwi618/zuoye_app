from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

from app.schemas.literature import (
    AnalysisCreate,
    AnalysisRead,
    CitedQuote,
    HighlightRead,
    OverviewRead,
    QuoteCreate,
    QuoteRead,
    QuoteVersion,
    TagRead,
    WorkLink,
    WorkRead,
)
from app.schemas.request import ProfileSummary
from app.schemas.forum import LikeResult
from app.services.forum import _fetch_profiles, _toggle_like
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


# Profile columns embedded with each row: enough for ProfileSummary, plus is_deleted, since
# content of soft-deleted users is hidden.
_PROFILE = "id, display_name, avatar_url, is_deleted"
# Analyses and quotes each reach profiles two ways (their author, and the users who liked an
# analysis / edited a quote version), so PostgREST needs the foreign key named or it refuses
# the query.
_ANALYSIS_AUTHOR = "author:profiles!lit_analyses_author_id_fkey"
_QUOTE_AUTHOR = "author:profiles!lit_quotes_author_id_fkey"
_VERSION = "id, number, body, page_start, page_end, edition"
# Every analysis comes with what it covers, its fragments and its tags in one round trip
# (PostgREST follows the foreign keys), instead of one query per table.
_ANALYSIS_FULL = (
    f"id, work_key, body, like_count, created_at, {_ANALYSIS_AUTHOR}({_PROFILE}), "
    "lit_analysis_likes(user_id), "
    "lit_analysis_quotes(quote_id, position, version_id, "
    "lit_highlights(number, start_offset, end_offset)), "
    "lit_analysis_tags(lit_tags(id, name, moderation_flagged))"
)
_ANALYSIS_TAGS = (
    f"work_key, {_ANALYSIS_AUTHOR}(is_deleted), "
    "lit_analysis_tags(lit_tags(id, name, moderation_flagged))"
)


def _shown(row: dict) -> bool:
    author = row.get("author")
    return bool(author) and not author["is_deleted"]


def _analyses(
    select: str,
    work_key: str | None = None,
    limit: int = _MAX_ANALYSES,
    liked_by: str | None = None,
) -> list[dict]:
    """Visible analyses, most liked first (then newest): not taken down, author not soft-deleted.

    With `liked_by`, the embedded lit_analysis_likes keeps only that user's like, so a
    non-empty list means they liked it.
    """
    query = get_supabase().table("lit_analyses").select(select).eq("moderation_flagged", False)
    if work_key:
        query = query.eq("work_key", work_key)
    if liked_by:
        query = query.eq("lit_analysis_likes.user_id", liked_by)
    rows = (
        query.order("like_count", desc=True).order("created_at", desc=True)
        .limit(limit).execute().data
        or []
    )
    return [r for r in rows if _shown(r)]


def _tags_of(analysis: dict) -> list[dict]:
    """An analysis's tags that are not taken down."""
    tags = (link.get("lit_tags") for link in analysis.get("lit_analysis_tags") or [])
    return [t for t in tags if t and not t["moderation_flagged"]]


def _usage() -> list[tuple[str, dict]]:
    """(work_key, tag) for every tag on every visible analysis, in all works.

    One query for all of them, counted in Python: fine while there are up to a
    thousand analyses; move into a database view once the tool is busy.
    """
    return [
        (a["work_key"], tag) for a in _analyses(_ANALYSIS_TAGS, limit=1000) for tag in _tags_of(a)
    ]


def _author(row: dict) -> ProfileSummary:
    return ProfileSummary(**row["author"])


# ---------------------------------------------------------------- reading


def get_work(user_id: str, work_key: str) -> WorkRead:
    def load_quotes() -> list[dict]:
        rows = (
            get_supabase()
            .table("lit_quotes")
            .select(f"*, {_QUOTE_AUTHOR}({_PROFILE}), lit_quote_versions({_VERSION})")
            .eq("work_key", work_key)
            .eq("moderation_flagged", False)
            .order("page_start").order("created_at")
            .limit(_MAX_QUOTES)
            .execute()
            .data
            or []
        )
        # By page; on the same page the longest passage first (PostgREST can't order by
        # length, so it's done here; the sort is stable, keeping the earliest first on ties).
        rows.sort(key=lambda r: (r["page_start"], -len(r["body"])))
        return [r for r in rows if _shown(r)]

    # The two queries don't depend on each other: run them side by side.
    with ThreadPoolExecutor(max_workers=2) as pool:
        quotes_job = pool.submit(load_quotes)
        analyses_job = pool.submit(_analyses, _ANALYSIS_FULL, work_key, liked_by=user_id)
        quotes, analyses = quotes_job.result(), analyses_job.result()

    quote_ids = {q["id"] for q in quotes}
    counts = Counter(t["id"] for a in analyses for t in _tags_of(a))
    names = {t["id"]: t["name"] for a in analyses for t in _tags_of(a)}
    cited = Counter(
        c["quote_id"] for a in analyses for c in a.get("lit_analysis_quotes") or []
    )
    cited_versions = {
        c["version_id"] for a in analyses for c in a.get("lit_analysis_quotes") or []
    }

    def tag_read(tag_id: str) -> TagRead:
        return TagRead(id=tag_id, name=names[tag_id], count=counts[tag_id])

    def analysis_read(a: dict) -> AnalysisRead:
        # The analysis shows the version of each quote it was written on, but a quote taken
        # down by moderation drops out of the analyses citing it.
        covered = sorted(
            (c for c in a.get("lit_analysis_quotes") or [] if c["quote_id"] in quote_ids),
            key=lambda c: c["position"],
        )
        highlights = sorted(
            (
                HighlightRead(
                    quote_id=c["quote_id"], number=h["number"],
                    start=h["start_offset"], end=h["end_offset"],
                )
                for c in covered
                for h in c.get("lit_highlights") or []
            ),
            key=lambda h: h.number,
        )
        return AnalysisRead(
            id=a["id"], work_key=a["work_key"], author=_author(a), body=a["body"],
            quote_ids=[c["quote_id"] for c in covered],
            quotes=[
                CitedQuote(quote_id=c["quote_id"], version_id=c["version_id"]) for c in covered
            ],
            highlights=highlights,
            tags=sorted((tag_read(t["id"]) for t in _tags_of(a)), key=lambda t: -t.count),
            like_count=a["like_count"], liked_by_me=bool(a.get("lit_analysis_likes")),
            created_at=a["created_at"],
        )

    return WorkRead(
        work_key=work_key,
        quotes=[
            QuoteRead(
                id=q["id"], work_key=q["work_key"], author=_author(q), body=q["body"],
                page_start=q["page_start"], page_end=q["page_end"], edition=q.get("edition"),
                cited_count=cited[q["id"]], created_at=q["created_at"],
            )
            for q in quotes
        ],
        analyses=[analysis_read(a) for a in analyses],
        versions=[
            QuoteVersion(quote_id=q["id"], **v)
            for q in quotes
            for v in q.get("lit_quote_versions") or []
            if v["id"] in cited_versions
        ],
        tags=sorted((tag_read(t) for t in counts), key=lambda t: (-t.count, t.name)),
    )


def list_tags(query: str | None, limit: int) -> list[TagRead]:
    """Every tag for the tag picker, most used (in all works) first."""
    def load_tags() -> list[dict]:
        return (
            get_supabase().table("lit_tags").select("id, name")
            .eq("moderation_flagged", False).execute().data
            or []
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        usage_job = pool.submit(_usage)
        tags_job = pool.submit(load_tags)
        counts = Counter(tag["id"] for _, tag in usage_job.result())
        tags = tags_job.result()

    q = (query or "").strip().lower().lstrip("#")
    found = [
        TagRead(id=t["id"], name=t["name"], count=counts[t["id"]])
        for t in tags
        if not q or q in t["name"].lower()
    ]
    found.sort(key=lambda t: (-t.count, t.name))
    return found[:limit]


def overview(limit: int) -> OverviewRead:
    usage = _usage()
    names = {tag["id"]: tag["name"] for _, tag in usage}
    totals = Counter(tag["id"] for _, tag in usage)
    top = sorted(totals, key=lambda t: (-totals[t], names[t]))[:limit]
    per_work = Counter((w, tag["id"]) for w, tag in usage if tag["id"] in top)
    return OverviewRead(
        tags=[TagRead(id=t, name=names[t], count=totals[t]) for t in top],
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
    moderated = ensure_allowed(payload.body, payload.edition)
    inserted = (
        get_supabase()
        .table("lit_quotes")
        .insert({
            "work_key": work_key,
            "author_id": user_id,
            "body": payload.body,
            "page_start": payload.page_start,
            "page_end": payload.page_end,
            "edition": payload.edition,
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
        edition=row.get("edition"), cited_count=0, created_at=row["created_at"],
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
        get_supabase()
        .table("lit_quotes")
        .select("id, work_key, moderation_flagged, lit_quote_versions(id, number, body)")
        .in_("id", quote_ids).execute().data
        or []
    )
    # The analysis is written on each quote's latest version; highlights are checked against
    # that version's text.
    quotes = {
        r["id"]: max(r["lit_quote_versions"], key=lambda v: v["number"])
        for r in rows
        if r["work_key"] == work_key and not r["moderation_flagged"] and r["lit_quote_versions"]
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
            {
                "analysis_id": analysis_id, "quote_id": q, "position": i,
                "version_id": quotes[q]["id"],
            }
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
        quotes=[CitedQuote(quote_id=q, version_id=quotes[q]["id"]) for q in quote_ids],
        highlights=[HighlightRead(**h.model_dump()) for h in payload.highlights],
        tags=[TagRead(id=t["id"], name=t["name"], count=0) for t in tags],
        like_count=0, liked_by_me=False, created_at=row["created_at"],
    )


def _analysis_row(analysis_id: str) -> dict:
    rows = (
        get_supabase().table("lit_analyses").select("author_id, like_count, moderation_flagged")
        .eq("id", analysis_id).limit(1).execute().data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    return rows[0]


def toggle_analysis_like(user_id: str, analysis_id: str) -> LikeResult:
    if _analysis_row(analysis_id)["moderation_flagged"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    liked = _toggle_like("lit_analysis_likes", "analysis_id", analysis_id, user_id)
    return LikeResult(liked=liked, like_count=_analysis_row(analysis_id)["like_count"])


def delete_analysis(user_id: str, analysis_id: str) -> None:
    if _analysis_row(analysis_id)["author_id"] != user_id:
        raise _reject("Only the author can delete this analysis", status.HTTP_403_FORBIDDEN)
    get_supabase().table("lit_analyses").delete().eq("id", analysis_id).execute()
