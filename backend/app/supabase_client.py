from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase() -> Client:
    """Server-side Supabase client using the service-role key.

    The service-role key bypasses RLS, so only use this client where we
    have already authenticated the caller and are intentionally acting
    on their behalf. For user-scoped queries that should honour RLS,
    create a per-request client carrying the user's JWT instead.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
