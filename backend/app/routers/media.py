from fastapi import APIRouter, File, UploadFile

from app.deps import CurrentUserDep
from app.schemas.media import MediaRead
from app.services import media as svc

router = APIRouter(prefix="/media", tags=["media"])


@router.post("", response_model=MediaRead, status_code=201)
def upload_media(user: CurrentUserDep, file: UploadFile = File(...)) -> MediaRead:
    return svc.upload(user.id, file)
