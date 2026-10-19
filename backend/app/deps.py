from typing import Annotated

import httpx
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.supabase_client import get_supabase


class CurrentUser(BaseModel):
    id: str
    email: str | None = None
    role: str | None = None


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Validate the caller's Supabase JWT by asking Supabase Auth.

    We hit GoTrue's /auth/v1/user endpoint with the user's bearer token.
    This works regardless of whether the project uses legacy HS256 secrets
    or the newer asymmetric (ES256/RS256) signing keys, and it doubles as
    a check that the session has not been revoked.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()
    settings = get_settings()

    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL or SUPABASE_ANON_KEY not configured",
        )

    try:
        res = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
            timeout=5.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Auth lookup failed: {exc}",
        ) from exc

    if res.status_code != 200:
        detail = "Invalid token"
        try:
            body = res.json()
            detail = body.get("msg") or body.get("error_description") or body.get("error") or detail
        except ValueError:
            pass
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    user = res.json()
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token did not resolve to a user",
        )

    # Soft-deleted accounts (profiles.is_deleted) are treated as deleted.
    profile_rows = (
        get_supabase()
        .table("profiles")
        .select("is_deleted")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if profile_rows and profile_rows[0].get("is_deleted"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deleted",
        )

    return CurrentUser(
        id=user_id,
        email=user.get("email"),
        role=user.get("role"),
    )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
