from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query

from app.deps import CurrentUserDep
from app.schemas.guide import (
    ActivityId,
    ActivityStar,
    CodeRequest,
    CouncilPerson,
    CouncilStatus,
    GuideEventRead,
    GuideEventSummary,
    GuideEventWrite,
    LikeState,
    MemberAdd,
    StarredActivity,
    StarWrite,
)
from app.services import guide as svc

router = APIRouter(prefix="/guide", tags=["guide"])


# ---- events ------------------------------------------------------------------------------------
@router.get("/events", response_model=list[GuideEventSummary])
def list_events(user: CurrentUserDep) -> list[GuideEventSummary]:
    """Newest first: every event for the student council, those open today for everyone else."""
    return svc.list_events(user.id)


@router.get("/events/{event_id}", response_model=GuideEventRead)
def get_event(user: CurrentUserDep, event_id: UUID) -> GuideEventRead:
    """The council always; anyone else on its open days (404 otherwise). Says whether the caller
    may edit or delete it."""
    return svc.get_event(user.id, str(event_id))


@router.post("/events", response_model=GuideEventRead, status_code=201)
def create_event(user: CurrentUserDep, payload: GuideEventWrite) -> GuideEventRead:
    """President or vice president only (403 council_required)."""
    return svc.create_event(user.id, payload)


@router.put("/events/{event_id}", response_model=GuideEventRead)
def update_event(
    user: CurrentUserDep, event_id: UUID, payload: GuideEventWrite
) -> GuideEventRead:
    """Anyone on the student council (403 council_required)."""
    return svc.update_event(user.id, str(event_id), payload)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(user: CurrentUserDep, event_id: UUID) -> None:
    """President or vice president only."""
    svc.delete_event(user.id, str(event_id))


# ---- likes and stars ---------------------------------------------------------------------------
@router.post("/events/{event_id}/likes/{activity_id}", response_model=LikeState)
def toggle_like(user: CurrentUserDep, event_id: UUID, activity_id: ActivityId) -> LikeState:
    """Likes or unlikes an activity; only on the event's open days (403 guide_not_open)."""
    return svc.toggle_like(user.id, str(event_id), activity_id)


@router.post("/events/{event_id}/stars/{activity_id}", response_model=ActivityStar)
def star(
    user: CurrentUserDep, event_id: UUID, activity_id: ActivityId, payload: StarWrite
) -> ActivityStar:
    """The council stars an activity of an event that has ended (409 guide_not_ended)."""
    return svc.star(user.id, str(event_id), activity_id, payload.note)


@router.get("/stars", response_model=list[StarredActivity])
def list_stars(user: CurrentUserDep) -> list[StarredActivity]:
    """星标活动, newest event first. The council only."""
    return svc.list_stars(user.id)


@router.patch("/stars/{star_id}", response_model=ActivityStar)
def update_star(user: CurrentUserDep, star_id: int, payload: StarWrite) -> ActivityStar:
    """The council changes a star's note."""
    return svc.update_star(user.id, star_id, payload.note)


@router.delete("/stars/{star_id}", status_code=204)
def unstar(user: CurrentUserDep, star_id: int) -> None:
    """The council takes a star away."""
    svc.unstar(user.id, star_id)


# ---- student council ---------------------------------------------------------------------------
@router.get("/council", response_model=CouncilStatus)
def council_status(user: CurrentUserDep) -> CouncilStatus:
    """The caller's office (none for most people); the president and vice also see their codes
    and the members."""
    return svc.council_status(user.id)


@router.post("/council/codes", response_model=CouncilStatus)
def new_code(user: CurrentUserDep, payload: CodeRequest) -> CouncilStatus:
    """The president makes a 传承码 (president; 409 council_too_early before 10 months) or a
    副会长码 (vice), cancelling an unused one of the same kind."""
    return svc.new_code(user.id, payload.role)


@router.delete("/council/codes/{role}", response_model=CouncilStatus)
def revoke_code(user: CurrentUserDep, role: Literal["president", "vice"]) -> CouncilStatus:
    """The president cancels their unused code of that kind."""
    return svc.revoke_code(user.id, role)


@router.delete("/council/vice", response_model=CouncilStatus)
def remove_vice(user: CurrentUserDep) -> CouncilStatus:
    """The president dismisses the vice president."""
    return svc.remove_vice(user.id)


@router.get("/users", response_model=list[CouncilPerson])
def search_users(
    user: CurrentUserDep, q: str = Query(default="", max_length=50)
) -> list[CouncilPerson]:
    """People by name, for adding a member. President only."""
    return svc.search_users(user.id, q)


@router.post("/council/members", response_model=CouncilStatus)
def add_member(user: CurrentUserDep, payload: MemberAdd) -> CouncilStatus:
    """The president adds a member (409 council_already if they are on the council)."""
    return svc.add_member(user.id, str(payload.user_id))


@router.post("/council/leave", response_model=CouncilStatus)
def leave(user: CurrentUserDep) -> CouncilStatus:
    """A member leaves the council (403 council_required if not a member)."""
    return svc.leave(user.id)


@router.delete("/council/members/{member_id}", response_model=CouncilStatus)
def remove_member(user: CurrentUserDep, member_id: UUID) -> CouncilStatus:
    """The president removes a member."""
    return svc.remove_member(user.id, str(member_id))
