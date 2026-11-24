-- 「活动指南」: likes and stars for the activities of an event.
--
-- Likes (点赞): on an event's open days, anyone who can see it likes its activities, one like per
-- person per activity, and takes it back with a second tap.
-- Stars (星标活动): the student council stars an activity of an event that has ended — it went
-- well, people liked it — and may write a note on it. When an event has ended, the activity with
-- the most likes (all of them on a tie; none without likes) gets a star by itself (auto).
-- Starred activities are listed on the 学生会 page, newest event first.
--
-- An activity is an entry of guide_events.config.activities; it now has a short id there
-- ("id", given by the backend on every save, backfilled below), which likes and stars point at.
-- A star copies the event's title and first day and the activity's name and place (kept in step
-- with the event by a trigger), and keeps them — and the number of likes — when the event is
-- deleted, so the list outlives the events.
-- Reads and writes go through the backend with the service role, so the tables have no policies.

begin;

-- Ids for the activities already saved (updated_at is left alone).
update public.guide_events e
set config = jsonb_set(e.config, '{activities}', (
  select coalesce(jsonb_agg(
    case when t.value ? 'id' then t.value
         else t.value || jsonb_build_object('id', substr(md5(gen_random_uuid()::text), 1, 8)) end
    order by t.n), '[]'::jsonb)
  from jsonb_array_elements(e.config -> 'activities') with ordinality as t(value, n)))
where jsonb_typeof(e.config -> 'activities') = 'array';

create table public.guide_likes (
  event_id    uuid        not null references public.guide_events(id) on delete cascade,
  activity_id text        not null check (char_length(activity_id) between 1 and 16),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, activity_id, user_id)
);

create table public.guide_stars (
  id          bigint      generated always as identity primary key,
  -- null once the event is deleted; the copies below stay.
  event_id    uuid        references public.guide_events(id) on delete set null,
  activity_id text        not null check (char_length(activity_id) between 1 and 16),
  event_title text        not null default '',
  event_day   date,
  name        text        not null default '',
  place       text        not null default '',
  -- The likes when the event was deleted; while it exists they are counted from guide_likes.
  likes       int         not null default 0,
  note        text        not null default '' check (char_length(note) <= 200),
  -- Given for the most likes rather than by the council.
  auto        boolean     not null default false,
  starred_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, activity_id)
);

create index guide_stars_day_idx on public.guide_stars (event_day desc nulls last, created_at desc);

alter table public.guide_likes enable row level security;
alter table public.guide_stars enable row level security;

-- Whether the most-liked activity has had its star (guide_award_stars).
alter table public.guide_events add column stars_awarded boolean not null default false;

-- Keeps the stars' copies in step when an event is saved, and keeps its likes when it is deleted.
create or replace function public.guide_stars_sync()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update public.guide_stars s
    set likes = (
      select count(*) from public.guide_likes l
      where l.event_id = old.id and l.activity_id = s.activity_id
    )
    where s.event_id = old.id;
    return old;
  end if;
  update public.guide_stars s
  set event_title = new.title,
      event_day = new.open_from,
      name = coalesce(m.act ->> 'name', s.name),
      place = coalesce(m.act ->> 'place', s.place)
  from (
    select s2.id, (
      select t.value from jsonb_array_elements(
        case when jsonb_typeof(new.config -> 'activities') = 'array'
             then new.config -> 'activities' else '[]'::jsonb end
      ) as t(value)
      where t.value ->> 'id' = s2.activity_id
      limit 1
    ) as act
    from public.guide_stars s2
    where s2.event_id = new.id
  ) m
  where s.id = m.id;
  return new;
end;
$$;

create trigger guide_stars_sync_update
after update of title, open_from, config on public.guide_events
for each row execute function public.guide_stars_sync();

create trigger guide_stars_sync_delete
before delete on public.guide_events
for each row execute function public.guide_stars_sync();

-- Stars the most-liked activities of the events that have ended (Beijing dates) and not had theirs
-- yet. An activity the council starred already keeps its star as it is. Run by the backend
-- before it shows stars.
create or replace function public.guide_award_stars()
returns void
language plpgsql
as $$
declare
  ev record;
begin
  for ev in
    select id, title, open_from, config from public.guide_events
    where not stars_awarded
      and open_to < (now() at time zone 'Asia/Shanghai')::date
    for update skip locked
  loop
    with acts as (
      select t.value as act from jsonb_array_elements(
        case when jsonb_typeof(ev.config -> 'activities') = 'array'
             then ev.config -> 'activities' else '[]'::jsonb end
      ) as t(value)
    ),
    counted as (
      select l.activity_id, count(*) as n
      from public.guide_likes l
      where l.event_id = ev.id
        and exists (select 1 from acts where acts.act ->> 'id' = l.activity_id)
      group by l.activity_id
    )
    insert into public.guide_stars (event_id, activity_id, event_title, event_day, name, place, auto)
    select distinct on (c.activity_id)
      ev.id, c.activity_id, ev.title, ev.open_from,
      coalesce(a.act ->> 'name', ''), coalesce(a.act ->> 'place', ''), true
    from counted c
    join acts a on a.act ->> 'id' = c.activity_id
    where c.n = (select max(n) from counted)
    on conflict (event_id, activity_id) do nothing;

    update public.guide_events set stars_awarded = true where id = ev.id;
  end loop;
end;
$$;

-- Likes per activity of one event.
create or replace function public.guide_like_counts(p_event uuid)
returns table (activity_id text, n bigint)
language sql
stable
as $$
  select l.activity_id, count(*) from public.guide_likes l
  where l.event_id = p_event
  group by l.activity_id;
$$;

-- The starred activities, newest event first, with their likes.
create or replace function public.guide_star_list(p_limit int default 200)
returns table (
  id bigint, event_id uuid, activity_id text, event_title text, event_day date, name text,
  place text, note text, auto boolean, likes bigint, created_at timestamptz
)
language sql
stable
as $$
  select s.id, s.event_id, s.activity_id, s.event_title, s.event_day, s.name, s.place, s.note,
    s.auto,
    case when s.event_id is null then s.likes::bigint else (
      select count(*) from public.guide_likes l
      where l.event_id = s.event_id and l.activity_id = s.activity_id
    ) end,
    s.created_at
  from public.guide_stars s
  order by s.event_day desc nulls last, s.created_at desc
  limit p_limit;
$$;

revoke execute on function public.guide_stars_sync() from public, anon, authenticated;
revoke execute on function public.guide_award_stars() from public, anon, authenticated;
revoke execute on function public.guide_like_counts(uuid) from public, anon, authenticated;
revoke execute on function public.guide_star_list(int) from public, anon, authenticated;

commit;
