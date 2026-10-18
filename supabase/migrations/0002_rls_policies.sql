-- Zuoyebang — RLS policies
--
-- Design: the frontend talks to FastAPI for all *writes*. FastAPI carries the
-- service-role key, which bypasses RLS, so writes go through trusted code only.
-- For *reads* the frontend can either go through FastAPI or query Supabase
-- directly with the user's anon JWT — these policies open up SELECT to all
-- authenticated users so the latter works.

-- =========================================================
-- profiles
-- =========================================================
alter table public.profiles enable row level security;

create policy "profiles: authenticated can read all"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: user can update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =========================================================
-- requests
-- =========================================================
alter table public.requests enable row level security;

create policy "requests: authenticated can read all"
  on public.requests for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE are intentionally not policied for authenticated
-- users → only the service_role key (used by FastAPI) can mutate.

-- =========================================================
-- feedbacks
-- =========================================================
alter table public.feedbacks enable row level security;

create policy "feedbacks: authenticated can read all"
  on public.feedbacks for select
  to authenticated
  using (true);

-- INSERT also locked down to service_role; FastAPI verifies that
-- (a) the request is completed, (b) the caller participated, and
-- (c) no duplicate feedback exists (also enforced by unique constraint).

-- =========================================================
-- Allow authenticated users to read the leaderboard view
-- =========================================================
grant select on public.user_ratings to authenticated;
