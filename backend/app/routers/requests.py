from fastapi import APIRouter, Query

from app.deps import CurrentUserDep
from app.schemas.request import (
    RequestCreate,
    RequestRead,
    RequestStatus,
    RequestUpdate,
    ScheduleRequest,
)
from app.services import requests as svc

router = APIRouter(prefix="/requests", tags=["requests"])


@router.get("", response_model=list[RequestRead])
def list_requests(
    user: CurrentUserDep,
    status: RequestStatus | None = Query(default=None),
    subject: str | None = Query(default=None),
    grade: str | None = Query(default=None),
    mine: bool = Query(default=False),
    exclude_mine: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[RequestRead]:
    return svc.list_requests(
        user.id,
        status_filter=status,
        subject=subject,
        grade=grade,
        mine=mine,
        exclude_mine=exclude_mine,
        limit=limit,
    )


@router.post("", response_model=RequestRead, status_code=201)
def create_request(user: CurrentUserDep, payload: RequestCreate) -> RequestRead:
    return svc.create_request(user.id, payload)


@router.get("/{request_id}", response_model=RequestRead)
def get_request(user: CurrentUserDep, request_id: str) -> RequestRead:
    _ = user  # auth-only
    return svc.get_request(request_id)


@router.patch("/{request_id}", response_model=RequestRead)
def update_request(
    user: CurrentUserDep, request_id: str, payload: RequestUpdate
) -> RequestRead:
    return svc.update_request(user.id, request_id, payload)


@router.post("/{request_id}/accept", response_model=RequestRead)
def accept_request(user: CurrentUserDep, request_id: str) -> RequestRead:
    return svc.accept_request(user.id, request_id)


@router.post("/{request_id}/schedule", response_model=RequestRead)
def schedule_request(
    user: CurrentUserDep, request_id: str, payload: ScheduleRequest
) -> RequestRead:
    return svc.schedule_request(user.id, request_id, payload)


@router.post("/{request_id}/complete", response_model=RequestRead)
def complete_request(user: CurrentUserDep, request_id: str) -> RequestRead:
    return svc.complete_request(user.id, request_id)


@router.post("/{request_id}/cancel", response_model=RequestRead)
def cancel_request(user: CurrentUserDep, request_id: str) -> RequestRead:
    return svc.cancel_request(user.id, request_id)
