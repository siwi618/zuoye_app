from fastapi import APIRouter

from app.deps import CurrentUserDep

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
def get_me(user: CurrentUserDep) -> dict[str, str | None]:
    return {"id": user.id, "email": user.email, "role": user.role}
