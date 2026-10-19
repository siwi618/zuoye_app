-- Soft delete for profiles.
--
-- Flip profiles.is_deleted to true (Table Editor or SQL) and the account
-- behaves as if it were deleted:
--   * the user is banned in Supabase Auth and all sessions are revoked,
--     so they are signed out and cannot sign in again;
--   * the backend hides requests they created or helped on, and the
--     feedback on those requests;
--   * they drop off the leaderboard.
-- Flip it back to false to restore the account and everything above.

alter table public.profiles
  add column is_deleted boolean not null default false;

comment on column public.profiles.is_deleted is
  'Soft delete flag. true = account behaves as deleted; false = normal.';

-- Only the dashboard / service role may change the flag. The "user can update
-- own" RLS policy would otherwise let users flip it on their own row.
create or replace function public.guard_profile_soft_delete()
returns trigger
language plpgsql
as $$
begin
  if new.is_deleted is distinct from old.is_deleted
     and current_user in ('authenticated', 'anon') then
    raise exception 'is_deleted can only be changed by an admin';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_soft_delete
  before update of is_deleted on public.profiles
  for each row execute function public.guard_profile_soft_delete();

-- Ban / unban the auth user to match the flag.
create or replace function public.sync_profile_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.is_deleted then
    update auth.users set banned_until = now() + interval '100 years' where id = new.id;
    delete from auth.sessions where user_id = new.id;
  else
    update auth.users set banned_until = null where id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_soft_delete
  after update of is_deleted on public.profiles
  for each row
  when (old.is_deleted is distinct from new.is_deleted)
  execute function public.sync_profile_soft_delete();

-- Leaderboard: ignore requests and feedback involving soft-deleted users.
create or replace view public.user_ratings as
select
  f.to_user_id                          as user_id,
  round(avg(f.rating)::numeric, 2)      as avg_rating,
  count(*)                              as feedback_count
from public.feedbacks f
join public.requests  r  on r.id  = f.request_id
join public.profiles  rq on rq.id = r.requester_id
join public.profiles  hp on hp.id = r.helper_id
where f.to_user_id = r.helper_id
  and not rq.is_deleted
  and not hp.is_deleted
group by f.to_user_id;
