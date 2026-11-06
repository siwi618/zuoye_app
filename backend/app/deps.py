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
# check the token again.
_AUTH_CACHE_SECONDS = 30
_AUTH_CACHE_MAX = 1000
_auth_cache: dict[str, tuple[float, CurrentUser]] = {}
_auth_cache_lock = threading.Lock()

# Tokens signed with the project's asymmetric keys are checked here against its public keys
# (JWKS) instead of asking Supabase Auth, which takes most of a second from the container.
# Trade-off: a signed-out or banned session keeps working until its token expires (the
# project's access token expiry), and a soft-deleted account for up to _DELETED_CACHE_SECONDS.
_LOCAL_ALGORITHMS = ("ES256", "RS256")
_JWKS_REFETCH_SECONDS = 60  # an unknown key id refetches the keys at most this often
_jwks: dict[str, dict] = {}
_jwks_fetched = 0.0
_jwks_lock = threading.Lock()

_DELETED_CACHE_SECONDS = 300
_deleted_cache: dict[str, tuple[float, bool]] = {}
_deleted_cache_lock = threading.Lock()


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
    """Validate the caller's Supabase JWT, locally when it is signed with a project key."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc

    key = None
    if header.get("alg") in _LOCAL_ALGORITHMS and header.get("kid"):
        key = _signing_key(header["kid"])
    # Legacy HS256 tokens, or the keys couldn't be fetched: ask Supabase Auth instead.
    user = _verify_locally(token, header["alg"], key) if key else _verify_remotely(token)

    # Soft-deleted accounts (profiles.is_deleted) are treated as deleted.
    if _is_deleted(user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deleted",
        )
    return user


def _signing_key(kid: str) -> dict | None:
    """The project's public key with this id, fetching the keys when it isn't known yet.

    Raises 401 for an id the project doesn't have; returns None when the keys can't be fetched.
    """
    global _jwks_fetched
    with _jwks_lock:
        if kid in _jwks:
            return _jwks[kid]
        if _jwks and time.monotonic() - _jwks_fetched < _JWKS_REFETCH_SECONDS:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown signing key"
            )
        settings = get_settings()
        try:
            res = httpx.get(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", timeout=5.0)
            res.raise_for_status()
            keys = res.json().get("keys") or []
        except (httpx.HTTPError, ValueError):
            return None
        _jwks.clear()
        _jwks.update({k["kid"]: k for k in keys if k.get("kid")})
        _jwks_fetched = time.monotonic()
        if kid not in _jwks:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown signing key"
            )
        return _jwks[kid]


def _verify_locally(token: str, alg: str, key: dict) -> CurrentUser:
    # The key is this project's own, so a valid signature already means our Supabase issued it.
    try:
        claims = jwt.decode(
            token, key, algorithms=[alg], audience="authenticated", options={"leeway": 10}
        )
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    if not claims.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token did not resolve to a user",
        )
    return CurrentUser(id=claims["sub"], email=claims.get("email"), role=claims.get("role"))


def _verify_remotely(token: str) -> CurrentUser:
    """Validate the caller's Supabase JWT by asking Supabase Auth.

    We hit GoTrue's /auth/v1/user endpoint with the user's bearer token.
    This works for legacy HS256 secrets too, and it doubles as a check that
    the session has not been revoked.
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
    return CurrentUser(
        id=user_id,
        email=user.get("email"),
        role=user.get("role"),
    )


def _is_deleted(user_id: str) -> bool:
    now = time.monotonic()
    with _deleted_cache_lock:
        hit = _deleted_cache.get(user_id)
        if hit and hit[0] > now:
            return hit[1]
    rows = (
        get_supabase()
        .table("profiles")
        .select("is_deleted")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    deleted = bool(rows and rows[0].get("is_deleted"))
    with _deleted_cache_lock:
        if len(_deleted_cache) >= _AUTH_CACHE_MAX:
            _deleted_cache.clear()
        _deleted_cache[user_id] = (now + _DELETED_CACHE_SECONDS, deleted)
    return deleted


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
