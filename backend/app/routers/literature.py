import re

from fastapi import APIRouter, HTTPException, Query

from app.deps import CurrentUserDep
from app.schemas.forum import LikeResult
from app.schemas.literature import (
    AnalysisCreate,
    AnalysisPage,
    AnalysisSort,
    CommentSort,
    DeviceRead,
    IntroKind,
    IntroRead,
    IntroUpdate,
    IntroVersion,
    LitCommentCreate,
    LitCommentRead,
    AnalysisRead,
    OverviewRead,
    QuoteCreate,
    QuoteRead,
    TagKind,
    TagRead,
    WorkCreate,
    WorkInfo,
    WorkKeyStr,
    WorkRead,
)
from app.services import literature as svc

router = APIRouter(prefix="/literature", tags=["literature"])


@router.get("/overview", response_model=OverviewRead)
def overview(user: CurrentUserDep, limit: int = Query(default=8, ge=1, le=30)) -> OverviewRead:
    _ = user
    return svc.overview(limit)


@router.get("/tags", response_model=list[TagRead])
def list_tags(
    user: CurrentUserDep,
    q: str | None = Query(default=None, max_length=20),
    limit: int = Query(default=20, ge=1, le=100),
    kind: TagKind = Query(default="device"),
    work: WorkKeyStr | None = Query(default=None),  # characters: the work they belong to
) -> list[TagRead]:
    _ = user
    return svc.list_tags(q, limit, kind, work)


@router.get("/works", response_model=list[WorkInfo])
def list_works(user: CurrentUserDep) -> list[WorkInfo]:
    _ = user
    return svc.list_works()


@router.post("/works", response_model=WorkInfo, status_code=201)
def create_work(user: CurrentUserDep, payload: WorkCreate) -> WorkInfo:
    """Only holders of the 「领读人」 badge (403 otherwise)."""
    return svc.create_work(user.id, payload)


@router.delete("/works/{work_key}", status_code=204)
def delete_work(user: CurrentUserDep, work_key: WorkKeyStr) -> None:
    """Only holders of the 「鱼果」 badge, and only while the work has no quotes, analyses or
    @character tags (409 otherwise)."""
    svc.delete_work(user.id, work_key)


@router.get("/works/{work_key}", response_model=WorkRead)
def get_work(user: CurrentUserDep, work_key: WorkKeyStr) -> WorkRead:
    return svc.get_work(user.id, work_key)


@router.get("/works/{work_key}/analyses", response_model=AnalysisPage)
def list_analyses(
    user: CurrentUserDep,
    work_key: WorkKeyStr,
    sort: AnalysisSort = Query(default=AnalysisSort.hot),
    tag: str | None = Query(default=None, max_length=20),  # a #device name
    who: str | None = Query(default=None, max_length=20),  # an @character name
    quote: str | None = Query(default=None, max_length=40),  # a quote id
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
) -> AnalysisPage:
    return svc.list_analyses(
        user.id, work_key, sort=sort, tag=tag, who=who, quote=quote, offset=offset, limit=limit
    )


@router.post("/works/{work_key}/quotes", response_model=QuoteRead, status_code=201)
def create_quote(user: CurrentUserDep, work_key: WorkKeyStr, payload: QuoteCreate) -> QuoteRead:
    return svc.create_quote(user.id, work_key, payload)


@router.put("/quotes/{quote_id}", status_code=204)
def update_quote(user: CurrentUserDep, quote_id: str, payload: QuoteCreate) -> None:
    svc.update_quote(user.id, quote_id, payload)


@router.delete("/quotes/{quote_id}", status_code=204)
def delete_quote(user: CurrentUserDep, quote_id: str) -> None:
    svc.delete_quote(user.id, quote_id)


@router.post("/works/{work_key}/analyses", response_model=AnalysisRead, status_code=201)
def create_analysis(
    user: CurrentUserDep, work_key: WorkKeyStr, payload: AnalysisCreate
) -> AnalysisRead:
    return svc.create_analysis(user.id, work_key, payload)


@router.put("/analyses/{analysis_id}", status_code=204)
def update_analysis(user: CurrentUserDep, analysis_id: str, payload: AnalysisCreate) -> None:
    svc.update_analysis(user.id, analysis_id, payload)


@router.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(user: CurrentUserDep, analysis_id: str) -> None:
    svc.delete_analysis(user.id, analysis_id)


@router.post("/analyses/{analysis_id}/like", response_model=LikeResult)
def toggle_analysis_like(user: CurrentUserDep, analysis_id: str) -> LikeResult:
    return svc.toggle_analysis_like(user.id, analysis_id)


def _intro_key_ok(kind: IntroKind, key: str) -> str:
    # A work by its key; a device by its tag name.
    pattern = r"^[a-z0-9-]{1,40}$" if kind == "work" else r"^[^#@()（）\s]{1,20}$"
    if not re.match(pattern, key):
        raise HTTPException(status_code=422, detail="Invalid introduction key")
    return key


@router.get("/intros/{kind}/{key}", response_model=IntroRead)
def get_intro(user: CurrentUserDep, kind: IntroKind, key: str) -> IntroRead:
    _ = user
    return svc.get_intro(kind, _intro_key_ok(kind, key))


@router.get("/intros/{kind}/{key}/history", response_model=list[IntroVersion])
def intro_history(user: CurrentUserDep, kind: IntroKind, key: str) -> list[IntroVersion]:
    _ = user
    return svc.intro_history(kind, _intro_key_ok(kind, key))


@router.put("/intros/{kind}/{key}", response_model=IntroRead)
def update_intro(
    user: CurrentUserDep, kind: IntroKind, key: str, payload: IntroUpdate
) -> IntroRead:
    return svc.update_intro(user.id, kind, _intro_key_ok(kind, key), payload)


@router.get("/analyses/{analysis_id}/comments", response_model=list[LitCommentRead])
def list_comments(
    user: CurrentUserDep, analysis_id: str, sort: CommentSort = Query(default=CommentSort.top)
) -> list[LitCommentRead]:
    return svc.list_comments(user.id, analysis_id, sort)


@router.post("/analyses/{analysis_id}/comments", response_model=LitCommentRead, status_code=201)
def create_comment(
    user: CurrentUserDep, analysis_id: str, payload: LitCommentCreate
) -> LitCommentRead:
    return svc.create_comment(user.id, analysis_id, payload)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(user: CurrentUserDep, comment_id: str) -> None:
    svc.delete_comment(user.id, comment_id)


@router.post("/comments/{comment_id}/like", response_model=LikeResult)
def toggle_comment_like(user: CurrentUserDep, comment_id: str) -> LikeResult:
    return svc.toggle_comment_like(user.id, comment_id)


@router.get("/devices/{name}", response_model=DeviceRead)
def get_device(user: CurrentUserDep, name: str) -> DeviceRead:
    _ = user
    return svc.get_device(_intro_key_ok("device", name))
