from fastapi import HTTPException, status

from app.schemas.message import MessageCreate, MessageRead
from app.schemas.request import ProfileSummary, RequestStatus
from app.services.moderation import ensure_allowed
from app.services.requests import _fetch_profiles, _get_row
from app.supabase_client import get_supabase

# Chat history is kept small; older messages are not shown.
_HISTORY_LIMIT = 200

# The chat opens once a helper accepts and stays readable after completion.
_READABLE = (RequestStatus.accepted.value, RequestStatus.completed.value)


def _participant_row(user_id: str, request_id: str) -> dict:
    """The request row, if the caller is its requester or helper and the chat is open."""
    row = _get_row(request_id)
    if user_id not in (row["requester_id"], row.get("helper_id")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requester and the helper can see this chat",
        )
    if row["status"] not in _READABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No chat for a {row['status']} request",
        )
    return row


def _hydrate(row: dict, profiles: dict[str, dict]) -> MessageRead:
    return MessageRead(
        id=row["id"],
        request_id=row["request_id"],
        sender=ProfileSummary(**profiles[row["sender_id"]]),
        body=row["body"],
        created_at=row["created_at"],
    )


def list_messages(user_id: str, request_id: str) -> list[MessageRead]:
    _participant_row(user_id, request_id)
    rows = (
        get_supabase()
        .table("request_messages")
        .select("id, request_id, sender_id, body, created_at")
        .eq("request_id", request_id)
        .eq("moderation_flagged", False)
        .order("created_at", desc=True)
        .limit(_HISTORY_LIMIT)
        .execute()
        .data
        or []
    )
    rows.reverse()  # oldest first, like a chat
    profiles = _fetch_profiles({r["sender_id"] for r in rows})
    return [_hydrate(r, profiles) for r in rows if r["sender_id"] in profiles]


def send_message(user_id: str, request_id: str, payload: MessageCreate) -> MessageRead:
    row = _participant_row(user_id, request_id)
    if row["status"] != RequestStatus.accepted.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chat is read-only once the request is completed",
        )
    moderated = ensure_allowed(payload.body)
    inserted = (
        get_supabase()
        .table("request_messages")
        .insert({
            "request_id": request_id,
            "sender_id": user_id,
            "body": payload.body,
            "moderated": moderated,
        })
        .execute()
        .data
    )
    if not inserted:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send message",
        )
    return _hydrate(inserted[0], _fetch_profiles({user_id}))
