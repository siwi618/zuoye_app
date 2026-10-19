-- Moderation status on every table that holds user-visible text.
--
--   moderated           true  = text was checked by the moderation model
--                       false = not checked yet (new sign-up, moderation was
--                               unreachable, or row predates moderation).
--                               The backend sweep re-checks these every 10 min.
--   moderation_flagged  true  = the sweep found the text violates the rules;
--                               the backend hides it.
--
-- Profiles have no moderation_flagged: a flagged display name is replaced
-- with a neutral "user_xxxxxx" instead.

alter table public.profiles       add column moderated boolean not null default false;
alter table public.requests       add column moderated boolean not null default false;
alter table public.feedbacks      add column moderated boolean not null default false;
alter table public.forum_posts    add column moderated boolean not null default false;
alter table public.forum_comments add column moderated boolean not null default false;

alter table public.requests       add column moderation_flagged boolean not null default false;
alter table public.feedbacks      add column moderation_flagged boolean not null default false;
alter table public.forum_posts    add column moderation_flagged boolean not null default false;
alter table public.forum_comments add column moderation_flagged boolean not null default false;

create index profiles_unmoderated_idx       on public.profiles (id)       where not moderated;
create index requests_unmoderated_idx       on public.requests (id)       where not moderated;
create index feedbacks_unmoderated_idx      on public.feedbacks (id)      where not moderated;
create index forum_posts_unmoderated_idx    on public.forum_posts (id)    where not moderated;
create index forum_comments_unmoderated_idx on public.forum_comments (id) where not moderated;

-- Users can edit their own profile directly (RLS "user can update own"), which
-- bypasses the backend. Any such edit to display_name / moderated sends the
-- row back to the queue.
create or replace function public.guard_profile_moderation()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.display_name is distinct from old.display_name
          or new.moderated is distinct from old.moderated) then
    new.moderated := false;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_moderation
  before update on public.profiles
  for each row execute function public.guard_profile_moderation();

-- One place for the Worker cron to ask "is anything waiting?".
create view public.moderation_queue as
            select 'profiles'       as source, id from public.profiles       where not moderated
  union all select 'requests',       id from public.requests       where not moderated
  union all select 'feedbacks',      id from public.feedbacks      where not moderated
  union all select 'forum_posts',    id from public.forum_posts    where not moderated
  union all select 'forum_comments', id from public.forum_comments where not moderated;

revoke all on public.moderation_queue from anon, authenticated;
