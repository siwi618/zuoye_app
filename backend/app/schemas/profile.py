from typing import Literal, get_args

from pydantic import BaseModel

# Keep in sync with GRADE_OPTIONS in frontend/src/lib/constants.ts.
Grade = Literal[
    "Grade 7",
    "Grade 8",
    "Grade 9",
    "Grade 10",
    "Grade 11",
    "Grade 12",
    "University",
    "Other",
]
GRADES: tuple[str, ...] = get_args(Grade)


class MyProfile(BaseModel):
    """The caller's own profile settings. grade is the default grade for new requests."""

    grade: Grade | None = None


class MyProfileUpdate(BaseModel):
    grade: Grade | None
