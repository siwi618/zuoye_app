from fastapi import APIRouter, Query

from app.deps import CurrentUserDep
from app.schemas.forum import LikeResult
from app.schemas.literature import (
    AnalysisCreate,
    AnalysisRead,
    OverviewRead,
    QuoteCreate,
    QuoteRead,
    TagRead,
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
) -> list[TagRead]:
    _ = user
    return svc.list_tags(q, limit)


@router.get("/works/{work_key}", response_model=WorkRead)
def get_work(user: CurrentUserDep, work_key: WorkKeyStr) -> WorkRead:
    return svc.get_work(user.id, work_key)


@router.post("/works/{work_key}/quotes", response_model=QuoteRead, status_code=201)
def create_quote(user: CurrentUserDep, work_key: WorkKeyStr, payload: QuoteCreate) -> QuoteRead:
    return svc.create_quote(user.id, work_key, payload)


@router.delete("/quotes/{quote_id}", status_code=204)
def delete_quote(user: CurrentUserDep, quote_id: str) -> None:
    svc.delete_quote(user.id, quote_id)


@router.post("/works/{work_key}/analyses", response_model=AnalysisRead, status_code=201)
def create_analysis(
    user: CurrentUserDep, work_key: WorkKeyStr, payload: AnalysisCreate
) -> AnalysisRead:
    return svc.create_analysis(user.id, work_key, payload)


@router.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(user: CurrentUserDep, analysis_id: str) -> None:
    svc.delete_analysis(user.id, analysis_id)


@router.post("/analyses/{analysis_id}/like", response_model=LikeResult)
def toggle_analysis_like(user: CurrentUserDep, analysis_id: str) -> LikeResult:
    return svc.toggle_analysis_like(user.id, analysis_id)
