from datetime import datetime
from typing import Annotated, Literal, get_args

from pydantic import BaseModel, StringConstraints

# Keep in sync with GRADE_OPTIONS in frontend/src/lib/constants.ts.
Grade = Literal[
    "Grade 7",
    "Grade 8",
    "Grade 9",
    "Grade 10",
    "Grade 11",
    "Grade 12",
    "Teacher",
    "Other",
]
GRADES: tuple[str, ...] = get_args(Grade)

DisplayNameStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class MyProfile(BaseModel):
    """The caller's own profile settings. grade is the default grade for new requests."""

    grade: Grade | None = None
    display_name: str = ""
    # When the next rename is allowed; None = allowed now.
    next_name_change_at: datetime | None = None


class MyProfileUpdate(BaseModel):
    grade: Grade | None


class NameUpdate(BaseModel):
    display_name: DisplayNameStr


# Keep in sync with the badges table (migration 0023) and the frontend's profile.badges.*.
LEAD_READER = "lead_reader"  # may add works to the literature tool


class BadgeRead(BaseModel):
    key: str
    granted_at: datetime


class BadgeRedeem(BaseModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
