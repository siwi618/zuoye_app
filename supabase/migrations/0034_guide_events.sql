-- 「活动指南」: a 3D map of the school building for each event — which rooms the activities are
-- in and the route there from a starting point — and the student council who runs them.
--
-- Events: one row per event. The map's settings (starting point, sign-in point, activities with
-- their rooms and times) are one JSON value, checked by the backend; the building itself is in
-- the frontend's code. Events belong to the student council, not to a person. The council (see
-- below) sees every event on its 学生会 page; everyone else sees an event only on its open days
-- (open_from–open_to, Beijing dates), when 「活动指南」 shows in the toolbox and its link works.
-- Reads and writes go through the backend with the service role, so the tables have no policies.
--
-- Student council: one president, at most one vice president and any number of members at a
-- time, each a term in council_terms with its (hidden) badge:
--   「现任鲦行知」 council_president  — the president; one holder on the whole site
--   「现任副鲦行知」 council_vice     — the vice president, appointed by the president
--   「小鲦」 council_member           — a member, added by the president; stays across terms
--     until they leave (退出) or the president removes them
--   「第 N 届鲦行知」 / 「第 N 届副鲦行知」 council_president_past / council_vice_past — kept by
--     presidents and vice presidents whose term ended (the terms are read from council_terms)
-- The president and vice president create, edit and delete events; members edit them.
-- The president hands over with a one-time 传承码: it can be made from 10 months after the term
-- began, and whoever redeems it becomes the next president (term N + 1). A president's badge
-- runs out a year after the term began. Whenever the president's term ends (handed over or run
-- out) the vice's ends too and the next president appoints a new one with a 副会长码; the members
-- stay. A vice whose term ends (handover, run out, removed, replaced) goes back to being a member,
-- unless they become president. Codes are valid for 7 days, one of each kind at a time (a new one cancels
-- the old).
--
-- The admin starts it off, or steps in when a president leaves without handing over:
--   select council_appoint('<user id>', <term>);                    -- term begins now
--   select council_appoint('<user id>', <term>, '2026-05-01+08');   -- term began then
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

insert into public.badges (key, sort_order) values
  ('council_president', 12),
  ('council_vice', 13),
  ('council_president_past', 14),
  ('council_vice_past', 15),
  ('council_member', 16);

-- =========================================================
-- Events
-- =========================================================
create table public.guide_events (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null check (char_length(title) between 1 and 60),
  subtitle    text        not null default '' check (char_length(subtitle) <= 80),
  config      jsonb       not null default '{}'::jsonb,
  -- Open to everyone on these Beijing dates; null = only the council sees it.
  open_from   date,
  open_to     date,
  -- auth.users rather than profiles: a second path from these rows to profiles would make the
  -- existing author:profiles(...) embeds ambiguous elsewhere.
  created_by  uuid        references auth.users(id) on delete set null,
  updated_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (open_to >= open_from),
  check ((open_from is null) = (open_to is null))
);

create index guide_events_updated_idx on public.guide_events (updated_at desc);
create index guide_events_open_idx on public.guide_events (open_from, open_to);

alter table public.guide_events enable row level security;

-- =========================================================
-- Student council
-- =========================================================
create table public.council_terms (
  id          bigint      generated always as identity primary key,
  term        int         not null check (term > 0),  -- 第 N 届; vice and members share the president's
  role        text        not null check (role in ('president', 'vice', 'member')),
  user_id     uuid        references public.profiles(id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- One open president and vice; one open term per person.
create unique index council_terms_open_idx on public.council_terms (role)
  where ended_at is null and role in ('president', 'vice');
create unique index council_terms_open_user_idx on public.council_terms (user_id)
  where ended_at is null;

-- Codes are stored like badge codes (8 characters, no look-alikes) and entered in the same box.
create table public.council_codes (
  code         text        primary key check (code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  role         text        not null check (role in ('president', 'vice')),
  term_id      bigint      not null references public.council_terms(id) on delete cascade,  -- president's
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  redeemed_by  uuid        references public.profiles(id) on delete set null,
  redeemed_at  timestamptz,
  revoked_at   timestamptz
);

alter table public.council_terms enable row level security;
alter table public.council_codes enable row level security;

-- How long a president holds the badge, and when they may make a 传承码.
create or replace function public.council_term_length() returns interval
language sql immutable as $$ select interval '1 year' $$;
create or replace function public.council_handover_after() returns interval
language sql immutable as $$ select interval '10 months' $$;

-- Ends a term: its holder's current badge goes, a president's or vice's becoming the past one
-- (granted again, so its red dot shows), and its unused codes are cancelled. A vice goes back to
-- being a member (in the same term).
create or replace function public.council_end_term(p_id bigint)
returns void
language plpgsql
as $$
declare
  t public.council_terms;
begin
  update public.council_terms set ended_at = now()
  where id = p_id and ended_at is null
  returning * into t;
  if t.id is null then
    return;
  end if;
  update public.council_codes set revoked_at = now()
  where term_id = t.id and redeemed_at is null and revoked_at is null;
  if t.user_id is null then
    return;
  end if;
  delete from public.user_badges where user_id = t.user_id and badge = 'council_' || t.role;
  if t.role = 'member' then
    return;
  end if;
  insert into public.user_badges (user_id, badge) values (t.user_id, 'council_' || t.role || '_past')
  on conflict (user_id, badge) do update set granted_at = now();
  if t.role = 'vice' then
    insert into public.council_terms (term, role, user_id) values (t.term, 'member', t.user_id);
    insert into public.user_badges (user_id, badge) values (t.user_id, 'council_member')
    on conflict (user_id, badge) do update set granted_at = now();
  end if;
end;
$$;

-- Ends the open president's and vice's terms (members stay).
create or replace function public.council_end_all()
returns void
language plpgsql
as $$
declare
  t record;
begin
  for t in
    select id from public.council_terms
    where ended_at is null and role in ('president', 'vice')
    order by id
    for update
  loop
    perform public.council_end_term(t.id);
  end loop;
end;
$$;

-- A president whose year is up leaves office, and the vice with them. Run before every
-- check, and every 10 minutes by the Worker so the badges change on time.
create or replace function public.council_expire()
returns void
language plpgsql
as $$
begin
  if exists (
    select 1 from public.council_terms
    where role = 'president' and ended_at is null
      and started_at + public.council_term_length() <= now()
  ) then
    perform public.council_end_all();
  end if;
end;
$$;

-- 'president', 'vice', 'member' or null for a user, after expiring an old term.
create or replace function public.council_role(p_user uuid)
returns text
language plpgsql
as $$
begin
  perform public.council_expire();
  return (select role from public.council_terms where user_id = p_user and ended_at is null);
end;
$$;

-- Admin: makes a user the president of term p_term (ending the open president's and vice's terms
-- first, and the user's membership).
create or replace function public.council_appoint(
  p_user uuid, p_term int, p_started timestamptz default now()
)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Unknown user: %', p_user;
  end if;
  perform public.council_end_all();
  perform public.council_end_term(id) from public.council_terms
  where ended_at is null and user_id = p_user;
  insert into public.council_terms (term, role, user_id, started_at)
  values (p_term, 'president', p_user, p_started);
  insert into public.user_badges (user_id, badge) values (p_user, 'council_president')
  on conflict (user_id, badge) do update set granted_at = now();
  perform public.council_expire();
end;
$$;

-- A code not used by any badge or council code.
create or replace function public.council_random_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(
        alphabet,
        1 + ((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::int & 2147483647)
             % length(alphabet)),
        1
      );
    end loop;
    exit when not exists (select 1 from public.badge_codes where code = c)
      and not exists (select 1 from public.council_codes where code = c);
  end loop;
  return c;
end;
$$;

-- The president makes a code: 'president' (传承码) or 'vice' (副会长码), cancelling their unused
-- one of the same kind. Status 'ok' with the code, 'not_allowed', or 'too_early' (a 传承码 before
-- 10 months into the term).
create or replace function public.council_new_code(p_user uuid, p_role text)
returns table (status text, code text)
language plpgsql
as $$
#variable_conflict use_column
declare
  t public.council_terms;
  c text;
begin
  perform public.council_expire();
  select * into t from public.council_terms
  where ended_at is null and user_id = p_user and role = 'president'
  for update;
  if t.id is null then
    return query select 'not_allowed'::text, null::text;
    return;
  end if;
  if p_role = 'president' and now() < t.started_at + public.council_handover_after() then
    return query select 'too_early'::text, null::text;
    return;
  end if;
  update public.council_codes set revoked_at = now()
  where term_id = t.id and role = p_role and redeemed_at is null and revoked_at is null;
  c := public.council_random_code();
  insert into public.council_codes (code, role, term_id, expires_at)
  values (c, p_role, t.id, now() + interval '7 days');
  return query select 'ok'::text, c;
end;
$$;

-- The president cancels their unused code of a kind.
create or replace function public.council_revoke_code(p_user uuid, p_role text)
returns void
language plpgsql
as $$
begin
  update public.council_codes cc set revoked_at = now()
  from public.council_terms t
  where cc.term_id = t.id and t.ended_at is null and t.user_id = p_user and t.role = 'president'
    and cc.role = p_role and cc.redeemed_at is null and cc.revoked_at is null;
end;
$$;

-- The president dismisses the vice president (who keeps 「第 N 届副鲦行知」 and stays a member).
create or replace function public.council_remove_vice(p_user uuid)
returns boolean
language plpgsql
as $$
declare
  v bigint;
begin
  perform public.council_expire();
  if not exists (
    select 1 from public.council_terms
    where role = 'president' and ended_at is null and user_id = p_user
  ) then
    return false;
  end if;
  select id into v from public.council_terms where role = 'vice' and ended_at is null for update;
  if v is not null then
    perform public.council_end_term(v);
  end if;
  return true;
end;
$$;

-- The president adds a member: 'ok', 'not_allowed' (the caller is not the president), 'unknown'
-- (no such user) or 'already' (on the council already).
create or replace function public.council_add_member(p_user uuid, p_member uuid)
returns text
language plpgsql
as $$
declare
  t public.council_terms;
begin
  perform public.council_expire();
  select * into t from public.council_terms
  where role = 'president' and ended_at is null and user_id = p_user;
  if t.id is null then
    return 'not_allowed';
  end if;
  if not exists (select 1 from public.profiles where id = p_member) then
    return 'unknown';
  end if;
  if exists (select 1 from public.council_terms where ended_at is null and user_id = p_member) then
    return 'already';
  end if;
  insert into public.council_terms (term, role, user_id) values (t.term, 'member', p_member);
  insert into public.user_badges (user_id, badge) values (p_member, 'council_member')
  on conflict (user_id, badge) do update set granted_at = now();
  return 'ok';
end;
$$;

-- The president removes a member.
create or replace function public.council_remove_member(p_user uuid, p_member uuid)
returns boolean
language plpgsql
as $$
declare
  v bigint;
begin
  perform public.council_expire();
  if not exists (
    select 1 from public.council_terms
    where role = 'president' and ended_at is null and user_id = p_user
  ) then
    return false;
  end if;
  select id into v from public.council_terms
  where role = 'member' and ended_at is null and user_id = p_member for update;
  if v is not null then
    perform public.council_end_term(v);
  end if;
  return true;
end;
$$;

-- A member leaves the council (退出). True if they were a member.
create or replace function public.council_leave(p_user uuid)
returns boolean
language plpgsql
as $$
declare
  v bigint;
begin
  select id into v from public.council_terms
  where role = 'member' and ended_at is null and user_id = p_user for update;
  if v is null then
    return false;
  end if;
  perform public.council_end_term(v);
  return true;
end;
$$;

-- Redeems a council code, all in one step, like redeem_badge_code: 'ok' with the badge,
-- 'already' (the user already holds that office or a higher one; the code stays unused) or
-- 'invalid' (unknown, used, cancelled, expired, or its president has left office).
--   传承码: the president's and vice's terms (and the user's membership) end; the user becomes
--   president of the next term. Members stay.
--   副会长码: the current vice's term (and the user's membership) ends; the user becomes vice.
create or replace function public.council_redeem(p_user uuid, p_code text)
returns table (status text, badge text)
language plpgsql
as $$
#variable_conflict use_column
declare
  cc public.council_codes;
  t public.council_terms;
  v bigint;
begin
  perform public.council_expire();
  select * into cc from public.council_codes
  where code = p_code and redeemed_at is null and revoked_at is null and expires_at > now()
  for update;
  if cc.code is null then
    return query select 'invalid'::text, null::text;
    return;
  end if;
  select * into t from public.council_terms where id = cc.term_id and ended_at is null;
  if t.id is null then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  if cc.role = 'president' then
    if t.user_id = p_user then
      return query select 'already'::text, 'council_president'::text;
      return;
    end if;
    update public.council_codes set redeemed_by = p_user, redeemed_at = now() where code = p_code;
    perform public.council_end_all();
    perform public.council_end_term(id) from public.council_terms
    where ended_at is null and user_id = p_user;
    insert into public.council_terms (term, role, user_id) values (t.term + 1, 'president', p_user);
    insert into public.user_badges (user_id, badge, code) values (p_user, 'council_president', p_code)
    on conflict (user_id, badge) do update set granted_at = now(), code = excluded.code;
    return query select 'ok'::text, 'council_president'::text;
    return;
  end if;

  -- 副会长码: not for the president or the current vice; a member moves up.
  if exists (
    select 1 from public.council_terms
    where role in ('president', 'vice') and ended_at is null and user_id = p_user
  ) then
    return query select 'already'::text, 'council_vice'::text;
    return;
  end if;
  update public.council_codes set redeemed_by = p_user, redeemed_at = now() where code = p_code;
  for v in
    select id from public.council_terms
    where ended_at is null and (role = 'vice' or user_id = p_user)
    for update
  loop
    perform public.council_end_term(v);
  end loop;
  insert into public.council_terms (term, role, user_id) values (t.term, 'vice', p_user);
  insert into public.user_badges (user_id, badge, code) values (p_user, 'council_vice', p_code)
  on conflict (user_id, badge) do update set granted_at = now(), code = excluded.code;
  return query select 'ok'::text, 'council_vice'::text;
end;
$$;

-- Only the backend (service role) and the Worker may call them.
revoke execute on function public.council_term_length() from public, anon, authenticated;
revoke execute on function public.council_handover_after() from public, anon, authenticated;
revoke execute on function public.council_end_term(bigint) from public, anon, authenticated;
revoke execute on function public.council_end_all() from public, anon, authenticated;
revoke execute on function public.council_expire() from public, anon, authenticated;
revoke execute on function public.council_role(uuid) from public, anon, authenticated;
revoke execute on function public.council_appoint(uuid, int, timestamptz) from public, anon, authenticated;
revoke execute on function public.council_random_code() from public, anon, authenticated;
revoke execute on function public.council_new_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.council_revoke_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.council_remove_vice(uuid) from public, anon, authenticated;
revoke execute on function public.council_add_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.council_remove_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.council_leave(uuid) from public, anon, authenticated;
revoke execute on function public.council_redeem(uuid, text) from public, anon, authenticated;

commit;
