-- Zuoyebang — initial schema
-- Apply via Supabase SQL Editor (paste & Run) or `supabase db push`.

-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists "pgcrypto";

-- =========================================================
-- Enums
-- =========================================================
create type public.request_status as enum ('open', 'accepted', 'completed', 'cancelled');
create type public.request_mode   as enum ('online', 'offline', 'either');

-- =========================================================
-- profiles  (mirrors auth.users 1:1)
-- =========================================================
create table public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  display_name  text        not null,
  grade         text,       -- e.g. "Grade 10", "高三", free-form for now
  school        text,
  bio           text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Public profile, one row per auth.users.';

-- Auto-create profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- requests
-- =========================================================
create table public.requests (
  id            uuid        primary key default gen_random_uuid(),
  requester_id  uuid        not null references public.profiles(id) on delete cascade,
  helper_id     uuid                 references public.profiles(id) on delete set null,
  grade         text        not null,
  subject       text        not null,          -- e.g. "Math", "Physics"
  topic         text,                          -- e.g. "Trigonometry", "Inequalities"
  description   text        not null,
  mode          public.request_mode   not null default 'either',
  status        public.request_status not null default 'open',
  scheduled_at  timestamptz,
  meeting_info  text,                          -- link or address agreed by both
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),

  constraint requester_is_not_helper check (helper_id is null or helper_id <> requester_id),
  constraint helper_required_when_accepted
    check ((status in ('open', 'cancelled')) or helper_id is not null)
);

create index requests_status_idx       on public.requests (status);
create index requests_requester_idx    on public.requests (requester_id);
create index requests_helper_idx       on public.requests (helper_id);
create index requests_subject_grade_idx on public.requests (subject, grade);
create index requests_created_at_idx   on public.requests (created_at desc);

-- =========================================================
-- feedbacks  (mutual, one per direction per request)
-- =========================================================
create table public.feedbacks (
  id            uuid        primary key default gen_random_uuid(),
  request_id    uuid        not null references public.requests(id) on delete cascade,
  from_user_id  uuid        not null references public.profiles(id) on delete cascade,
  to_user_id    uuid        not null references public.profiles(id) on delete cascade,
  rating        smallint    not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),

  constraint feedback_self_blocked check (from_user_id <> to_user_id),
  constraint feedback_one_per_direction unique (request_id, from_user_id)
);

create index feedbacks_to_user_idx   on public.feedbacks (to_user_id);
create index feedbacks_request_idx   on public.feedbacks (request_id);

-- =========================================================
-- updated_at auto-touch
-- =========================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger requests_touch_updated_at
  before update on public.requests
  for each row execute function public.touch_updated_at();

-- =========================================================
-- Leaderboard view: per-user aggregated rating
-- =========================================================
create or replace view public.user_ratings as
select
  to_user_id                              as user_id,
  round(avg(rating)::numeric, 2)          as avg_rating,
  count(*)                                as feedback_count
from public.feedbacks
group by to_user_id;

comment on view public.user_ratings is 'Per-user aggregated rating, used by leaderboard.';
