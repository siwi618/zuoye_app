import hashlib
import threading
import time
from typing import Annotated

import httpx
from fastapi import Depends, Header, HTTPException, status
from jose import jwt
from jose.exceptions import JWTError
from pydantic import BaseModel

from app.config import get_settings
from app.supabase_client import get_supabase


class CurrentUser(BaseModel):
    id: str
    email: str | None = None
    role: str | None = None


# Successful auth lookups are reused for a short while so each request doesn't
# make two round trips to Supabase. Trade-off: a revoked session or a newly
# soft-deleted account keeps working for up to _AUTH_CACHE_SECONDS.
_AUTH_CACHE_SECONDS = 30
_AUTH_CACHE_MAX = 1000
_auth_cache: dict[str, tuple[float, CurrentUser]] = {}
_auth_cache_lock = threading.Lock()


def _cache_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _cache_get(key: str) -> CurrentUser | None:
    with _auth_cache_lock:
        hit = _auth_cache.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        _auth_cache.pop(key, None)
        return None


def _cache_put(key: str, token: str, user: CurrentUser) -> None:
    ttl = float(_AUTH_CACHE_SECONDS)
    # Never trust a cached token past its own expiry.
    try:
        exp = jwt.get_unverified_claims(token).get("exp")
        if exp:
            ttl = min(ttl, exp - time.time())
    except JWTError:
        pass
    if ttl <= 0:
        return

    now = time.monotonic()
    with _auth_cache_lock:
        if len(_auth_cache) >= _AUTH_CACHE_MAX:
            for k in [k for k, (expires, _) in _auth_cache.items() if expires <= now]:
                del _auth_cache[k]
            if len(_auth_cache) >= _AUTH_CACHE_MAX:
                _auth_cache.clear()
        _auth_cache[key] = (now + ttl, user)


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Resolve the caller from their Supabase JWT, using the short auth cache."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()
    key = _cache_key(token)
    cached = _cache_get(key)
    if cached:
        return cached

    user = _verify_token(token)
    _cache_put(key, token, user)
    return user


def _verify_token(token: str) -> CurrentUser:
    """Validate the caller's Supabase JWT by asking Supabase Auth.

    We hit GoTrue's /auth/v1/user endpoint with the user's bearer token.
    This works regardless of whether the project uses legacy HS256 secrets
    or the newer asymmetric (ES256/RS256) signing keys, and it doubles as
    a check that the session has not been revoked.
    """
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
