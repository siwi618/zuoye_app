from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_validator

# The building (rooms, corridors, stairs) is in the frontend's code; an event only names places
# from it, so the backend checks the shape and sizes, not that a room exists.
PlaceStr = Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)]
GuideTitleStr = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)
]
GuideSubtitleStr = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]
ColorStr = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]

MAX_ACTIVITIES = 30
MAX_LABELS = 40
LabelKey = Annotated[str, StringConstraints(min_length=1, max_length=24)]
LabelOffset = Annotated[float, Field(ge=-200, le=200)]
# An activity's id inside the event (likes and stars point at it); the backend gives one to every
# activity it saves without one.
ActivityId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,16}$")]
StarNoteStr = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class CustomStart(BaseModel):
    """A starting point picked on the map: a floor and a spot in the plan's coordinates."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] = ""
    floor: int = Field(ge=1, le=3)
    pos: Annotated[list[float], Field(min_length=2, max_length=2)]


class GuideActivity(BaseModel):
    id: ActivityId | None = None
    place: PlaceStr
    name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] = ""
    time: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] = ""
    color: ColorStr | None = None


class GuideConfig(BaseModel):
    # A preset entrance's name (e.g. 二楼连廊), a point picked on the map, or none (no route).
    start: PlaceStr | CustomStart | None = None
    # An entrance or room name, "起点" for the same spot as the start, or "" for none.
    sign: PlaceStr = ""
    activities: Annotated[list[GuideActivity], Field(max_length=MAX_ACTIVITIES)] = []
    # Where an editor dragged a label: a room's activity card (keyed by the room's name) or the
    # start / sign-in tag ("@start", "@sign"), as an offset from the spot it points at, in the
    # map's own units across and down the screen (so it holds when the map is zoomed or turned).
    labels: Annotated[
        dict[LabelKey, Annotated[list[LabelOffset], Field(min_length=2, max_length=2)]],
        Field(max_length=MAX_LABELS),
    ] = {}


MAX_OPEN_DAYS = 31


class GuideEventWrite(BaseModel):
    title: GuideTitleStr
    subtitle: GuideSubtitleStr = ""
    config: GuideConfig = GuideConfig()
    # Beijing dates on which everyone may see it; none = only the student council.
    open_from: date | None = None
    open_to: date | None = None

    @model_validator(mode="after")
    def _open_days(self) -> "GuideEventWrite":
        if (self.open_from is None) != (self.open_to is None):
            raise ValueError("open_from and open_to go together")
        if self.open_from and self.open_to:
            if self.open_to < self.open_from:
                raise ValueError("open_to is before open_from")
            if (self.open_to - self.open_from).days >= MAX_OPEN_DAYS:
                raise ValueError(f"open for at most {MAX_OPEN_DAYS} days")
        return self


class GuideEventSummary(BaseModel):
    id: str
    title: str
    subtitle: str
    activity_count: int
    updated_at: datetime
    open_from: date | None = None
    open_to: date | None = None


class ActivityStar(BaseModel):
    id: int
    note: str = ""
    auto: bool = False  # for the most likes, not starred by the council


class GuideEventRead(BaseModel):
    id: str
    title: str
    subtitle: str
    config: GuideConfig
    updated_at: datetime
    open_from: date | None = None
    open_to: date | None = None
    # The caller may change it (anyone on the student council) …
    can_edit: bool = False
    # … and delete it (the president or vice president).
    can_manage: bool = False
    # Likes per activity id, and the ones the caller gave; they may like on the open days.
    likes: dict[str, int] = {}
    liked: list[str] = []
    can_like: bool = False
    # Starred activities by id; the council may star once the event has ended.
    stars: dict[str, ActivityStar] = {}
    can_star: bool = False


class StarWrite(BaseModel):
    note: StarNoteStr = ""


class StarredActivity(BaseModel):
    """One entry of 星标活动 (the event may have been deleted since: event_id is then None)."""

    id: int
    event_id: str | None = None
    activity_id: str
    event_title: str
    event_day: date | None = None
    name: str
    place: str
    note: str
    auto: bool
    likes: int
    created_at: datetime


class LikeState(BaseModel):
    liked: bool
    count: int


CouncilRole = Literal["president", "vice", "member"]


class CouncilPerson(BaseModel):
    id: str
    display_name: str
    grade: str | None = None


class CouncilCode(BaseModel):
    code: str  # CORAL-XXXX-XXXX
    expires_at: datetime


class CouncilStatus(BaseModel):
    """The caller's place on the student council, with the president, vice and members; the
    president also sees their 传承码 and 副会长码."""

    role: CouncilRole | None = None
    term: int | None = None
    started_at: datetime | None = None
    # The president's badge runs out then (a year after the term began).
    expires_at: datetime | None = None
    # The president may make a 传承码 from then (10 months into the term).
    handover_from: datetime | None = None
    president_code: CouncilCode | None = None
    vice_code: CouncilCode | None = None
    president: CouncilPerson | None = None
    vice: CouncilPerson | None = None
    members: list[CouncilPerson] = []


class CodeRequest(BaseModel):
    role: Literal["president", "vice"]  # 传承码 or 副会长码


class MemberAdd(BaseModel):
    user_id: UUID
