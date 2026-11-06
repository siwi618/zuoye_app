-- 「鲷苗人」: a second evolving badge, for writing literature analyses (鲷树人 is 周树人 and 鲈鲟
-- is 鲁迅). A user's analyses (not taken down by moderation) count, against farming, only when:
--   - it was posted at least 30 minutes ago;
--   - it has at some point had at least 10 likes (it keeps counting if likes are taken back).
-- The stages:
--    5 → writer_5  「鲷苗人」  common
--   15 → writer_15 「鲷木人」  epic
--   30 → writer_30 「鲷树人」  legendary
--   50 → writer_50 「鲈鲟哥儿」 mythic
-- Like 「雷蜂」 (migration 0026), each stage is its own badge, a worn lower stage moves up, and
-- the badge wall shows the highest stage with its progress.
--
-- lit_analyses.liked10_at records when an analysis first reached 10 likes. When that happens to
-- one already 30 minutes old, its author gets the stages reached right away. One that reaches 10
-- likes sooner counts once it is 30 minutes old; the backend checks again whenever the user's
-- badges are fetched (the header does so on every visit). Existing authors are credited at the
-- end.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

insert into public.badges (key, sort_order) values
  ('writer_5', 30), ('writer_15', 31), ('writer_30', 32), ('writer_50', 33);

alter table public.lit_analyses add column liked10_at timestamptz;
update public.lit_analyses set liked10_at = now() where like_count >= 10;

create or replace function public.lit_analyses_mark_liked10()
returns trigger
language plpgsql
as $$
begin
  if new.like_count >= 10 and new.liked10_at is null then
    new.liked10_at := now();
  end if;
  return new;
end;
$$;

create trigger lit_analyses_mark_liked10
  before update of like_count on public.lit_analyses
  for each row execute function public.lit_analyses_mark_liked10();

-- How many of the user's analyses count, by the rules above. The backend shows it as progress.
create or replace function public.counted_analyses(p_user uuid)
returns int
language sql
stable
as $$
  select count(*)::int
  from public.lit_analyses
  where author_id = p_user
    and not moderation_flagged
    and liked10_at is not null
    and created_at <= now() - interval '30 minutes';
$$;

-- Gives the user every writer stage they have reached, and moves a worn lower stage up.
create or replace function public.grant_writer_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  written int := public.counted_analyses(p_user);
  top     text;
begin
  insert into public.user_badges (user_id, badge)
  select p_user, s.key
  from (values ('writer_5', 5), ('writer_15', 15), ('writer_30', 30), ('writer_50', 50)) s(key, need)
  where written >= s.need
  on conflict do nothing;

  select s.key into top
  from (values ('writer_5', 5), ('writer_15', 15), ('writer_30', 30), ('writer_50', 50)) s(key, need)
  where written >= s.need
  order by s.need desc
  limit 1;

  if top is not null then
    update public.profiles
    set worn_badge = top
    where id = p_user
      and worn_badge in ('writer_5', 'writer_15', 'writer_30', 'writer_50')
      and worn_badge <> top;
  end if;
end;
$$;

create or replace function public.lit_analyses_grant_writer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.liked10_at is null and new.liked10_at is not null then
    perform public.grant_writer_badges(new.author_id);
  end if;
  return new;
end;
$$;

create trigger lit_analyses_grant_writer
  after update of like_count on public.lit_analyses
  for each row execute function public.lit_analyses_grant_writer();

revoke execute on function public.counted_analyses(uuid) from public, anon, authenticated;
revoke execute on function public.grant_writer_badges(uuid) from public, anon, authenticated;

-- Credit what has already been written.
select public.grant_writer_badges(a.author_id)
from (select distinct author_id from public.lit_analyses where liked10_at is not null) a;

commit;
