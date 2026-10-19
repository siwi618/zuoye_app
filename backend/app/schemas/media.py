from pydantic import BaseModel

# At most this many attachments per request / post / comment.
MAX_ATTACHMENTS = 4


class MediaRead(BaseModel):
    id: str
    kind: str  # "image" | "video"
    url: str
