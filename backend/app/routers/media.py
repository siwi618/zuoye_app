from fastapi import APIRouter, File, UploadFile

from pydantic import BaseModel

from app.config import get_settings
from app.deps import CurrentUserDep
from app.schemas.media import MediaRead
from app.services import media as svc

router = APIRouter(prefix="/media", tags=["media"])


class MediaConfig(BaseModel):
    video_enabled: bool


@router.get("/config", response_model=MediaConfig)
def media_config(user: CurrentUserDep) -> MediaConfig:
    _ = user
    return MediaConfig(video_enabled=get_settings().media_video_enabled)


@router.post("", response_model=MediaRead, status_code=201)
def upload_media(user: CurrentUserDep, file: UploadFile = File(...)) -> MediaRead:
    return svc.upload(user.id, file)
