from collections import Counter
from typing import NamedTuple
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

from app.schemas.literature import (
    AnalysisCreate,
    AnalysisPage,
    AnalysisSort,
    CommentSort,
    DeviceRead,
    AnalysisRead,
    CitedQuote,
    HighlightRead,
    IntroRead,
    IntroUpdate,
    IntroVersion,
    LitCommentCreate,
    LitCommentRead,
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
# Who last changed each quote (its versions' editors), for 「X 上次整理」.
_QUOTE_EDITS = (
    f"number, created_at, editor:profiles!lit_quote_versions_edited_by_fkey({_PROFILE})"
)
# Every analysis comes with what it covers, its fragments and its tags in one round trip
# (PostgREST follows the foreign keys), instead of one query per table.
_ANALYSIS_FULL = (
    f"id, work_key, body, like_count, comment_count, created_at, {_ANALYSIS_AUTHOR}({_PROFILE}), "
    "lit_analysis_likes(user_id), "
    "lit_analysis_quotes(quote_id, position, version_id, "
    "lit_quote_versions(id, number, body, page_start, page_end, edition), "
    "lit_highlights(number, start_offset, end_offset, color)), "
    "lit_analysis_tags(lit_tags(id, name, kind, moderation_flagged))"
)
# Without the text: for counting, sorting and filtering all of a work's analyses.
_ANALYSIS_INDEX = (
    f"id, created_at, like_count, {_ANALYSIS_AUTHOR}(id, is_deleted), "
    "lit_analysis_quotes(quote_id), "
    "lit_analysis_tags(lit_tags(id, name, kind, moderation_flagged))"
)
_ANALYSIS_TAGS = (
    f"work_key, {_ANALYSIS_AUTHOR}(is_deleted), "
    "lit_analysis_tags(lit_tags(id, name, kind, moderation_flagged))"
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


def _usage(kind: str = "device") -> list[tuple[str, dict]]:
    """(work_key, tag) for every tag of that kind on every visible analysis, in all works.

    One query for all of them, counted in Python: fine while there are up to a
    thousand analyses; move into a database view once the tool is busy.
    """
    return [
        (a["work_key"], tag)
        for a in _analyses(_ANALYSIS_TAGS, limit=1000)
        for tag in _tags_of(a)
        if tag["kind"] == kind
    ]


def _author(row: dict) -> ProfileSummary:
    return ProfileSummary(**row["author"])


# ---------------------------------------------------------------- reading


def _quote_rows(work_key: str, select: str) -> list[dict]:
    """A work's visible quotes: by page; on the same page the longest passage first (PostgREST
    can't order by length, so it's done here; the sort is stable, keeping the earliest first on
    ties)."""
    rows = (
        get_supabase()
        .table("lit_quotes")
        .select(select)
        .eq("work_key", work_key)
        .eq("moderation_flagged", False)
        .order("page_start").order("created_at")
        .limit(_MAX_QUOTES)
        .execute()
        .data
        or []
    )
    rows.sort(key=lambda r: (r["page_start"], -len(r.get("body") or "")))
    return [r for r in rows if _shown(r)]


def _analysis_index(work_key: str) -> list[dict]:
    """Every visible analysis of a work, without its text: enough to count tags and citations,
    and to sort and filter before fetching one page in full."""
    return _analyses(_ANALYSIS_INDEX, work_key, limit=1000)


def _tag_counts(index: list[dict]) -> tuple[Counter, dict[str, dict]]:
    counts = Counter(t["id"] for a in index for t in _tags_of(a))
    rows = {t["id"]: t for a in index for t in _tags_of(a)}
    return counts, rows


def get_work(user_id: str, work_key: str) -> WorkRead:
    """A work's quotes, the tags its analyses use (with counts) and how many analyses there
    are; the analyses themselves come a page at a time from list_analyses()."""
    _ = user_id
    with ThreadPoolExecutor(max_workers=2) as pool:
        quotes_job = pool.submit(
            _quote_rows, work_key,
            f"*, {_QUOTE_AUTHOR}({_PROFILE}), lit_quote_versions({_QUOTE_EDITS})",
        )
        index_job = pool.submit(_analysis_index, work_key)
        quotes, index = quotes_job.result(), index_job.result()

    counts, tag_rows = _tag_counts(index)
    cited = Counter(c["quote_id"] for a in index for c in a.get("lit_analysis_quotes") or [])

    def quote_read(q: dict) -> QuoteRead:
        latest = max(q.get("lit_quote_versions") or [{}], key=lambda v: v.get("number", 0))
        edited = latest.get("number", 1) > 1 and latest.get("editor")
        return QuoteRead(
            id=q["id"], work_key=q["work_key"], author=_author(q), body=q["body"],
            page_start=q["page_start"], page_end=q["page_end"], edition=q.get("edition"),
            cited_count=cited[q["id"]], created_at=q["created_at"],
            last_editor=ProfileSummary(**latest["editor"]) if edited else None,
            edited_at=latest["created_at"] if edited else None,
        )

    return WorkRead(
        work_key=work_key,
        quotes=[quote_read(q) for q in quotes],
        tags=sorted(
            (
                TagRead(id=t, name=tag_rows[t]["name"], kind=tag_rows[t]["kind"], count=n)
                for t, n in counts.items()
            ),
            key=lambda t: (-t.count, t.name),
        ),
        analysis_count=len(index),
    )


def _order(index: list[dict], sort: AnalysisSort, user_id: str) -> list[dict]:
    newest = sorted(index, key=lambda a: a["created_at"], reverse=True)
    # Stable sorts: most liked first, newest first among equals.
    hottest = sorted(newest, key=lambda a: -a["like_count"])
    if sort == AnalysisSort.new:
        return newest
    if sort == AnalysisSort.mine:
        # The reader's own on top (newest first), then everyone else's by likes.
        own = [a for a in newest if a["author"]["id"] == user_id]
        return own + [a for a in hottest if a["author"]["id"] != user_id]
    return hottest


def list_analyses(
    user_id: str,
    work_key: str,
    *,
    sort: AnalysisSort,
    tag: str | None,
    who: str | None,
    quote: str | None,
    offset: int,
    limit: int,
) -> AnalysisPage:
    """One page of a work's analyses, sorted and filtered (by #device, @character, quote) over
    all of them, then fetched in full for just that page."""
    with ThreadPoolExecutor(max_workers=2) as pool:
        index_job = pool.submit(_analysis_index, work_key)
        quotes_job = pool.submit(
            _quote_rows, work_key, f"id, page_start, {_QUOTE_AUTHOR}(is_deleted)"
        )
        index, visible = index_job.result(), {q["id"] for q in quotes_job.result()}

    def tagged(a: dict, kind: str, name: str | None) -> bool:
        return not name or any(
            t["kind"] == kind and t["name"].lower() == name.lower() for t in _tags_of(a)
        )

    matching = [
        a for a in index
        if tagged(a, "device", tag) and tagged(a, "character", who)
        and (not quote or any(c["quote_id"] == quote for c in a["lit_analysis_quotes"] or []))
    ]
    page_ids = [a["id"] for a in _order(matching, sort, user_id)[offset:offset + limit]]
    full = {
        a["id"]: a
        for a in (
            get_supabase().table("lit_analyses").select(_ANALYSIS_FULL)
            .in_("id", page_ids).eq("lit_analysis_likes.user_id", user_id)
            .execute().data
            or []
        )
    } if page_ids else {}
    counts, _ = _tag_counts(index)

    items, versions = [], {}
    for analysis_id in page_ids:
        a = full.get(analysis_id)
        if not a:
            continue
        items.append(_analysis_read(a, visible, counts))
        for c in a.get("lit_analysis_quotes") or []:
            v = c.get("lit_quote_versions")
            if v and c["quote_id"] in visible:
                versions[v["id"]] = QuoteVersion(quote_id=c["quote_id"], **v)
    end = offset + len(page_ids)
    return AnalysisPage(
        items=items,
        versions=list(versions.values()),
        total=len(matching),
        next_offset=end if end < len(matching) else None,
    )


def _analysis_read(a: dict, visible_quotes: set[str], counts: Counter) -> AnalysisRead:
    # The analysis shows the version of each quote it was written on, but a quote taken down
    # by moderation drops out of the analyses citing it.
    covered = sorted(
        (c for c in a.get("lit_analysis_quotes") or [] if c["quote_id"] in visible_quotes),
        key=lambda c: c["position"],
    )
    highlights = sorted(
        (
            HighlightRead(
                quote_id=c["quote_id"], number=h["number"],
                start=h["start_offset"], end=h["end_offset"], color=h.get("color", "amber"),
            )
            for c in covered
            for h in c.get("lit_highlights") or []
        ),
        key=lambda h: h.number,
    )
    tags = [
        TagRead(id=t["id"], name=t["name"], kind=t["kind"], count=counts[t["id"]])
        for t in _tags_of(a)
    ]
    return AnalysisRead(
        id=a["id"], work_key=a["work_key"], author=_author(a), body=a["body"],
        quote_ids=[c["quote_id"] for c in covered],
        quotes=[CitedQuote(quote_id=c["quote_id"], version_id=c["version_id"]) for c in covered],
        highlights=highlights,
        tags=sorted(tags, key=lambda t: -t.count),
        like_count=a["like_count"], liked_by_me=bool(a.get("lit_analysis_likes")),
        comment_count=a.get("comment_count", 0), created_at=a["created_at"],
    )


def list_tags(
    query: str | None, limit: int, kind: str = "device", work_key: str | None = None
) -> list[TagRead]:
    """Tags for the tag picker, most used first: every #device, or one work's @characters."""
    def load_tags() -> list[dict]:
        q = get_supabase().table("lit_tags").select("id, name, kind").eq("kind", kind)
        if kind == "character":
            q = q.eq("work_key", work_key)
        return q.eq("moderation_flagged", False).execute().data or []

    with ThreadPoolExecutor(max_workers=2) as pool:
        usage_job = pool.submit(_usage, kind)
        tags_job = pool.submit(load_tags)
        counts = Counter(tag["id"] for _, tag in usage_job.result())
        tags = tags_job.result()

    q = (query or "").strip().lower().lstrip("#@")
    found = [
        TagRead(id=t["id"], name=t["name"], kind=t["kind"], count=counts[t["id"]])
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


def update_quote(user_id: str, quote_id: str, payload: QuoteCreate) -> None:
    """Anyone may edit a quote: the edit becomes its next version. Analyses already written
    keep the version they cite; new ones are written on this one."""
    _quote_row(quote_id)
    db = get_supabase()

    def latest() -> dict:
        return (
            db.table("lit_quote_versions").select("number, body, page_start, page_end, edition")
            .eq("quote_id", quote_id).order("number", desc=True).limit(1).execute().data
            or [{"number": 0}]
        )[0]

    fields = {
        "body": payload.body, "page_start": payload.page_start, "page_end": payload.page_end,
        "edition": payload.edition,
    }
    current = latest()
    if all(current.get(k) == v for k, v in fields.items()):
        return
    moderated = ensure_allowed(payload.body, payload.edition)
    # Two edits at once would take the same number; the loser retries with the next one.
    for attempt in range(3):
        try:
            db.table("lit_quote_versions").insert({
                "quote_id": quote_id, "number": current["number"] + 1, "edited_by": user_id,
                **fields,
            }).execute()
            break
        except APIError as exc:
            if exc.code != _UNIQUE_VIOLATION or attempt == 2:
                raise
            current = latest()
    db.table("lit_quotes").update({**fields, "moderated": moderated}).eq("id", quote_id).execute()


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


def _find_tag(name: str, kind: str, work_key: str | None) -> dict | None:
    # ilike without wildcards = equality ignoring case, matching the unique indexes on lower(name)
    # (devices across the site, characters within their work).
    pattern = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    query = (
        get_supabase().table("lit_tags").select("id, name, kind, moderation_flagged")
        .ilike("name", pattern).eq("kind", kind)
    )
    if kind == "character":
        query = query.eq("work_key", work_key)
    rows = query.limit(1).execute().data or []
    return rows[0] if rows else None


def _resolve_tags(
    user_id: str,
    names: list[str],
    moderated: bool,
    kind: str = "device",
    work_key: str | None = None,
) -> list[dict]:
    """Existing tags by name (ignoring case), creating the missing ones. Characters belong to
    `work_key`; devices to no work."""
    tags: list[dict] = []
    for name in names:
        tag = _find_tag(name, kind, work_key)
        if not tag:
            try:
                created = (
                    get_supabase()
                    .table("lit_tags")
                    .insert({
                        "name": name, "kind": kind,
                        "work_key": work_key if kind == "character" else None,
                        "created_by": user_id, "moderated": moderated,
                    })
                    .execute()
                    .data
                )
                tag = (created or [None])[0]
            except APIError as exc:
                if exc.code != _UNIQUE_VIOLATION:
                    raise
                tag = _find_tag(name, kind, work_key)
        if not tag or tag.get("moderation_flagged"):
            raise _reject(CONTENT_REJECTED)
        tags.append(tag)
    return tags


class _ResolvedTags(NamedTuple):
    rows: list[dict]
    moderated: bool  # whether the text and new names were checked


def _resolve_all_tags(user_id: str, payload: AnalysisCreate, work_key: str) -> _ResolvedTags:
    """An analysis's #devices and its work's @characters, moderated with its text."""
    devices = _unique_names(payload.tags)
    characters = _unique_names(payload.characters)
    moderated = ensure_allowed(payload.body, " ".join(devices + characters))
    rows = _resolve_tags(user_id, devices, moderated) + _resolve_tags(
        user_id, characters, moderated, "character", work_key
    )
    return _ResolvedTags(rows, moderated)


def _unique_names(names: list[str]) -> list[str]:
    """Tag names without repeats (ignoring case), first spelling kept."""
    out: list[str] = []
    for name in names:
        if name.lower() not in {n.lower() for n in out}:
            out.append(name)
    return out


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

    tags, moderated = _resolve_all_tags(user_id, payload, work_key)

    # Written in one database transaction (migration 0020): all of it or nothing.
    made = (
        get_supabase()
        .rpc("lit_create_analysis", {
            "p_work_key": work_key,
            "p_author_id": user_id,
            "p_body": payload.body,
            "p_moderated": moderated,
            "p_quotes": [{"quote_id": q, "version_id": quotes[q]["id"]} for q in quote_ids],
            "p_highlights": [h.model_dump() for h in payload.highlights],
            "p_tag_ids": [t["id"] for t in tags],
        })
        .execute()
        .data
    )
    if not made:
        raise _reject("Failed to create analysis", status.HTTP_500_INTERNAL_SERVER_ERROR)
    analysis_id = made["id"]

    profiles = _fetch_profiles({user_id})
    return AnalysisRead(
        id=analysis_id, work_key=work_key, author=ProfileSummary(**profiles[user_id]),
        body=payload.body, quote_ids=quote_ids,
        quotes=[CitedQuote(quote_id=q, version_id=quotes[q]["id"]) for q in quote_ids],
        highlights=[HighlightRead(**h.model_dump()) for h in payload.highlights],
        tags=[TagRead(id=t["id"], name=t["name"], kind=t["kind"], count=0) for t in tags],
        like_count=0, liked_by_me=False, created_at=made["created_at"],
    )


def update_analysis(user_id: str, analysis_id: str, payload: AnalysisCreate) -> None:
    """The author rewrites their analysis: its text, tags and fragments, and may drop quotes.

    It stays on the quote versions it was written on (no quotes can be added), so the
    fragments are checked against those versions' text.
    """
    row = _analysis_row(analysis_id)
    if row["author_id"] != user_id or row["moderation_flagged"]:
        raise _reject("Only the author can edit this analysis", status.HTTP_403_FORBIDDEN)
    db = get_supabase()
    covered = {
        c["quote_id"]: c
        for c in (
            db.table("lit_analysis_quotes")
            .select("quote_id, version_id, lit_quote_versions(body)")
            .eq("analysis_id", analysis_id).execute().data
            or []
        )
    }
    quote_ids = list(dict.fromkeys(payload.quote_ids))
    if any(q not in covered for q in quote_ids):
        raise _reject(INVALID_ANALYSIS)
    _check_highlights(payload, {q: covered[q]["lit_quote_versions"] for q in quote_ids})

    tags, moderated = _resolve_all_tags(user_id, payload, row["work_key"])

    # Applied in one database transaction (migration 0016): all of it or nothing.
    db.rpc("lit_update_analysis", {
        "p_analysis_id": analysis_id,
        "p_body": payload.body,
        "p_moderated": moderated,
        "p_quote_ids": quote_ids,
        "p_highlights": [h.model_dump() for h in payload.highlights],
        "p_tag_ids": [t["id"] for t in tags],
    }).execute()


def _analysis_row(analysis_id: str) -> dict:
    rows = (
        get_supabase()
        .table("lit_analyses")
        .select("author_id, work_key, like_count, moderation_flagged")
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


# ---------------------------------------------------------------- introductions


def _intro_key(kind: str, key: str) -> str:
    # Devices by name ignoring case, as their tags are matched.
    return key.lower() if kind == "device" else key


def _intro_versions(kind: str, key: str, limit: int = 50) -> list[dict]:
    """Visible versions, newest first: not taken down, editor not soft-deleted."""
    rows = (
        get_supabase()
        .table("lit_intro_versions")
        .select(
            "id, number, body, created_at, moderation_flagged, "
            f"editor:profiles!lit_intro_versions_edited_by_fkey({_PROFILE})"
        )
        .eq("subject_kind", kind)
        .eq("subject_key", _intro_key(kind, key))
        .order("number", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return [
        r for r in rows
        if not r["moderation_flagged"] and r.get("editor") and not r["editor"]["is_deleted"]
    ]


def _intro_version(r: dict) -> IntroVersion:
    return IntroVersion(
        id=r["id"], number=r["number"], body=r["body"],
        editor=ProfileSummary(**r["editor"]), created_at=r["created_at"],
    )


def get_intro(kind: str, key: str) -> IntroRead:
    rows = _intro_versions(kind, key)
    return IntroRead(
        kind=kind, key=key,
        current=_intro_version(rows[0]) if rows else None,
        version_count=len(rows),
    )


def intro_history(kind: str, key: str) -> list[IntroVersion]:
    return [_intro_version(r) for r in _intro_versions(kind, key)]


def update_intro(user_id: str, kind: str, key: str, payload: IntroUpdate) -> IntroRead:
    """Anyone may edit an introduction: the text becomes its next version. Bringing back an
    older text is saving it again."""
    current = _intro_versions(kind, key)  # the newest visible one is what readers see
    if current and current[0]["body"] == payload.body:
        return get_intro(kind, key)
    moderated = ensure_allowed(payload.body)
    db = get_supabase()

    def last_number() -> int:
        rows = (
            db.table("lit_intro_versions").select("number")
            .eq("subject_kind", kind).eq("subject_key", _intro_key(kind, key))
            .order("number", desc=True).limit(1).execute().data
            or []
        )
        return rows[0]["number"] if rows else 0

    # Two saves at once would take the same number; the loser retries with the next one.
    for attempt in range(3):
        try:
            db.table("lit_intro_versions").insert({
                "subject_kind": kind, "subject_key": _intro_key(kind, key),
                "number": last_number() + 1, "body": payload.body,
                "edited_by": user_id, "moderated": moderated,
            }).execute()
            break
        except APIError as exc:
            if exc.code != _UNIQUE_VIOLATION or attempt == 2:
                raise
    return get_intro(kind, key)


# ---------------------------------------------------------------- comments on analyses

_COMMENT = (
    "id, analysis_id, body, like_count, created_at, parent_id, moderation_flagged, "
    f"author:profiles!lit_analysis_comments_author_id_fkey({_PROFILE}), "
    f"reply_to:profiles!lit_analysis_comments_reply_to_user_id_fkey({_PROFILE}), "
    "lit_comment_likes(user_id)"
)


def _visible_analysis(analysis_id: str) -> dict:
    row = _analysis_row(analysis_id)
    if row["moderation_flagged"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    return row


def _comment_read(r: dict) -> LitCommentRead:
    reply_to = r.get("reply_to")
    return LitCommentRead(
        id=r["id"], analysis_id=r["analysis_id"], author=_author(r), body=r["body"],
        like_count=r["like_count"], liked_by_me=bool(r.get("lit_comment_likes")),
        created_at=r["created_at"], parent_id=r.get("parent_id"),
        reply_to=ProfileSummary(**reply_to) if reply_to and r.get("parent_id") else None,
    )


def list_comments(user_id: str, analysis_id: str, sort: CommentSort) -> list[LitCommentRead]:
    """An analysis's comments and replies; one query. Top-level comments in the asked order,
    replies as they come (the page puts them oldest first under their thread)."""
    _visible_analysis(analysis_id)
    query = (
        get_supabase().table("lit_analysis_comments").select(_COMMENT)
        .eq("analysis_id", analysis_id).eq("moderation_flagged", False)
        .eq("lit_comment_likes.user_id", user_id)
    )
    if sort == CommentSort.top:
        query = query.order("like_count", desc=True).order("created_at")
    else:
        query = query.order("created_at", desc=True)
    rows = [r for r in (query.execute().data or []) if _shown(r)]
    # A reply is hidden along with its thread's top-level comment.
    tops = {r["id"] for r in rows if not r.get("parent_id")}
    return [_comment_read(r) for r in rows if not r.get("parent_id") or r["parent_id"] in tops]


def _comment_row(comment_id: str) -> dict:
    rows = (
        get_supabase().table("lit_analysis_comments")
        .select("id, analysis_id, author_id, parent_id, moderation_flagged")
        .eq("id", comment_id).limit(1).execute().data
        or []
    )
    if not rows or rows[0]["moderation_flagged"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return rows[0]


def create_comment(user_id: str, analysis_id: str, payload: LitCommentCreate) -> LitCommentRead:
    _visible_analysis(analysis_id)
    parent_id = reply_to_user_id = None
    if payload.reply_to_id:
        target = _comment_row(payload.reply_to_id)
        if target["analysis_id"] != analysis_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        # Replies to a reply join the same thread, under its top-level comment.
        parent_id = target.get("parent_id") or target["id"]
        reply_to_user_id = target["author_id"]
    moderated = ensure_allowed(payload.body)
    inserted = (
        get_supabase()
        .table("lit_analysis_comments")
        .insert({
            "analysis_id": analysis_id, "author_id": user_id, "body": payload.body,
            "parent_id": parent_id, "reply_to_user_id": reply_to_user_id,
            "moderated": moderated,
        })
        .execute()
        .data
    )
    row = (inserted or [None])[0]
    if not row:
        raise _reject("Failed to create comment", status.HTTP_500_INTERNAL_SERVER_ERROR)
    profiles = _fetch_profiles({user_id} | ({reply_to_user_id} if reply_to_user_id else set()))
    return LitCommentRead(
        id=row["id"], analysis_id=analysis_id, author=ProfileSummary(**profiles[user_id]),
        body=row["body"], like_count=0, liked_by_me=False, created_at=row["created_at"],
        parent_id=parent_id,
        reply_to=(
            ProfileSummary(**profiles[reply_to_user_id])
            if reply_to_user_id in profiles else None
        ),
    )


def delete_comment(user_id: str, comment_id: str) -> None:
    """The author deletes their comment; a top-level comment takes its replies with it."""
    if _comment_row(comment_id)["author_id"] != user_id:
        raise _reject("Only the author can delete this comment", status.HTTP_403_FORBIDDEN)
    get_supabase().table("lit_analysis_comments").delete().eq("id", comment_id).execute()


def toggle_comment_like(user_id: str, comment_id: str) -> LikeResult:
    _comment_row(comment_id)
    liked = _toggle_like("lit_comment_likes", "comment_id", comment_id, user_id)
    count = (
        get_supabase().table("lit_analysis_comments").select("like_count")
        .eq("id", comment_id).limit(1).execute().data
        or [{"like_count": 0}]
    )[0]["like_count"]
    return LikeResult(liked=liked, like_count=count)


def get_device(name: str) -> DeviceRead:
    """Where a #device is used: every work whose visible analyses carry it, with counts."""
    usage = [(w, t) for w, t in _usage("device") if t["name"].lower() == name.lower()]
    per_work = Counter(w for w, _ in usage)
    return DeviceRead(
        name=usage[0][1]["name"] if usage else name,
        tag_id=usage[0][1]["id"] if usage else None,
        total=len(usage),
        works=[
            WorkLink(work_key=w, tag_id=usage[0][1]["id"], count=n)
            for w, n in sorted(per_work.items(), key=lambda x: (-x[1], x[0]))
        ],
    )
