from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, StringConstraints

from app.services import moderation as svc

router = APIRouter(prefix="/moderation", tags=["moderation"])

DisplayNameStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class DisplayNameCheck(BaseModel):
    display_name: DisplayNameStr


class CheckResult(BaseModel):
    allowed: bool


@router.post("/display-name", response_model=CheckResult)
def check_display_name(payload: DisplayNameCheck) -> CheckResult:
    # No auth: called from the sign-up form before the account exists.
    return CheckResult(allowed=svc.is_allowed(payload.display_name))
