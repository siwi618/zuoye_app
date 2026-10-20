from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.schemas.request import ProfileSummary

MessageBodyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class MessageCreate(BaseModel):
    body: MessageBodyStr


class MessageRead(BaseModel):
    id: str
    request_id: str
    sender: ProfileSummary
    body: str
    created_at: datetime
