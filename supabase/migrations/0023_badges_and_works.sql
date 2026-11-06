-- Badges, one-time codes that grant them, and the literature tool's works in the database.
--
-- Badges show on the owner's profile (their badge wall). A badge can also allow something:
-- 「领读人」(lead_reader) lets its holder add works to the literature tool. Badges are given
-- with one-time codes: the admin runs
--
--   select new_badge_code('lead_reader');        -- valid for 7 days
--   select new_badge_code('lead_reader', 30);    -- valid for 30 days
--
-- in the SQL Editor and sends the code it returns (CORAL-XXXX-XXXX); the recipient enters it
-- on their profile. A badge is taken back by deleting its row from user_badges.
--
-- The works were a list in the frontend's code until now; they move to lit_works, with the
-- same keys, so everything already written under them stays where it is.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

-- =========================================================
-- Badges
-- =========================================================
-- Names and descriptions live in the frontend's translations, under the badge's key.
create table public.badges (
  key         text        primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  sort_order  smallint    not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.badges (key, sort_order) values ('lead_reader', 10);

create table public.user_badges (
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  badge       text        not null references public.badges(key) on delete cascade,
  granted_at  timestamptz not null default now(),
  code        text,       -- the code it was redeemed with, if any
  primary key (user_id, badge)
);

-- Codes are stored without the CORAL- prefix and dashes: 8 characters from an alphabet
-- without look-alikes (no 0/O, 1/I/L).
create table public.badge_codes (
  code         text        primary key check (code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  badge        text        not null references public.badges(key) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  redeemed_by  uuid        references public.profiles(id) on delete set null,
  redeemed_at  timestamptz
);

-- Only the backend (service role) reads or writes these.
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.badge_codes enable row level security;

-- A new one-time code for `p_badge`, valid for `p_days` days.
create or replace function public.new_badge_code(p_badge text, p_days int default 7)
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  if not exists (select 1 from public.badges where key = p_badge) then
    raise exception 'Unknown badge: %', p_badge;
  end if;
  loop
    c := '';
    for i in 1..8 loop
      -- gen_random_uuid() draws from the server's secure random source.
      c := c || substr(
        alphabet,
        1 + ((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::int & 2147483647)
             % length(alphabet)),
        1
      );
    end loop;
    exit when not exists (select 1 from public.badge_codes where code = c);
  end loop;
  insert into public.badge_codes (code, badge, expires_at)
  values (c, p_badge, now() + make_interval(days => p_days));
  return 'CORAL-' || substr(c, 1, 4) || '-' || substr(c, 5, 4);
end;
$$;

-- Redeems a code for a user, all in one step: 'ok' with the badge, 'already' (the user has
-- that badge; the code stays unused) or 'invalid' (unknown, used or expired). Two people
-- redeeming the same code at once: the second waits for the first, then finds it used.
create or replace function public.redeem_badge_code(p_user uuid, p_code text)
returns table (status text, badge text)
language plpgsql
as $$
#variable_conflict use_column
declare
  b text;
begin
  select bc.badge into b
  from public.badge_codes bc
  where bc.code = p_code and bc.redeemed_by is null and bc.expires_at > now()
  for update;
  if b is null then
    return query select 'invalid'::text, null::text;
    return;
  end if;
  if exists (select 1 from public.user_badges ub where ub.user_id = p_user and ub.badge = b) then
    return query select 'already'::text, b;
    return;
  end if;
  update public.badge_codes set redeemed_by = p_user, redeemed_at = now() where code = p_code;
  insert into public.user_badges (user_id, badge, code) values (p_user, b, p_code);
  return query select 'ok'::text, b;
end;
$$;

-- Without this, any signed-in user could call them through the API.
revoke execute on function public.new_badge_code(text, int) from public, anon, authenticated;
revoke execute on function public.redeem_badge_code(uuid, text) from public, anon, authenticated;

-- =========================================================
-- Works
-- =========================================================
create table public.lit_works (
  id                  uuid        primary key default gen_random_uuid(),
  key                 text        not null unique check (key ~ '^[a-z0-9-]{1,40}$'),
  title               text        not null check (char_length(title) between 1 and 40),
  author              text        not null check (char_length(author) between 1 and 40),
  year                smallint    check (year between -3000 and 2100),
  group_name          text        check (char_length(group_name) between 1 and 20),
  added_by            uuid        references public.profiles(id) on delete set null,
  moderated           boolean     not null default false,
  moderation_flagged  boolean     not null default false,
  created_at          timestamptz not null default now()
);

-- One work per title and author.
create unique index lit_works_title_author_idx on public.lit_works (lower(title), lower(author));
create index lit_works_unmoderated_idx on public.lit_works (id) where not moderated;

alter table public.lit_works enable row level security;

create policy "lit_works: authenticated can read all"
  on public.lit_works for select to authenticated using (true);

-- The works the frontend listed, oldest first, as before.
insert into public.lit_works (key, title, author, year, group_name, moderated, created_at) values
  ('moon',  '月亮与六便士', '毛姆', 1919, null,   true, '2026-11-01 00:00:00+00'),
  ('chess', '棋王',         '阿城', 1984, '三王', true, '2026-11-01 00:00:01+00'),
  ('tree',  '树王',         '阿城', 1985, '三王', true, '2026-11-01 00:00:02+00'),
  ('kids',  '孩子王',       '阿城', 1985, '三王', true, '2026-11-01 00:00:03+00');

-- Added works are re-checked by the moderation sweep when the check at adding time was
-- unavailable.
create or replace view public.moderation_queue as
select 'profiles' as source, p.id
from public.profiles p
where not p.moderated and not p.is_deleted

union all
select 'requests', r.id
from public.requests r
join public.profiles rq on rq.id = r.requester_id
left join public.profiles hp on hp.id = r.helper_id
where not r.moderated and not rq.is_deleted and not coalesce(hp.is_deleted, false)

union all
select 'feedbacks', f.id
from public.feedbacks f
join public.profiles fu on fu.id = f.from_user_id
join public.profiles tu on tu.id = f.to_user_id
where not f.moderated and not fu.is_deleted and not tu.is_deleted

union all
select 'forum_posts', fp.id
from public.forum_posts fp
join public.profiles a on a.id = fp.author_id
where not fp.moderated and not a.is_deleted

union all
select 'forum_comments', fc.id
from public.forum_comments fc
join public.profiles a  on a.id  = fc.author_id
join public.forum_posts fp on fp.id = fc.post_id
join public.profiles pa on pa.id = fp.author_id
where not fc.moderated and not a.is_deleted and not pa.is_deleted

union all
select 'media', m.id
from public.media m
join public.profiles o on o.id = m.owner_id
where not m.moderated and not o.is_deleted

union all
select 'request_messages', rm.id
from public.request_messages rm
join public.profiles s on s.id = rm.sender_id
where not rm.moderated and not s.is_deleted

union all
select 'lit_quotes', q.id
from public.lit_quotes q
join public.profiles a on a.id = q.author_id
where not q.moderated and not a.is_deleted

union all
select 'lit_tags', t.id
from public.lit_tags t
join public.profiles a on a.id = t.created_by
where not t.moderated and not a.is_deleted

union all
select 'lit_analyses', la.id
from public.lit_analyses la
join public.profiles a on a.id = la.author_id
where not la.moderated and not a.is_deleted

union all
select 'lit_intro_versions', iv.id
from public.lit_intro_versions iv
join public.profiles a on a.id = iv.edited_by
where not iv.moderated and not a.is_deleted

union all
select 'lit_analysis_comments', c.id
from public.lit_analysis_comments c
join public.profiles a on a.id = c.author_id
where not c.moderated and not a.is_deleted

union all
select 'lit_works', w.id
from public.lit_works w
where not w.moderated;

revoke all on public.moderation_queue from anon, authenticated;

commit;
