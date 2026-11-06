-- 「雷蜂」: a badge anyone can earn by helping, which evolves as they help more. A helper's
-- completed requests (not taken down by moderation) count, against farming with a second
-- account, only when:
--   - at least 15 minutes passed between accepting and completing;
--   - the requester's account was at least a day old when it was completed;
--   - it is one of at most 2 from the same requester in any hour (by completion time).
-- The stages:
--    10 → bee_10  「雷蜂」 common
--    25 → bee_25  「靁蜂」 epic
--    50 → bee_50  「靐蜂」 legendary
--   100 → bee_100 「䨻蜂」 mythic
-- Each stage is its own badge, so names and rarity work like any other badge; the badge wall
-- shows only the highest stage, with progress towards the next.
--
-- The database hands them out: when a request becomes completed, its helper gets every stage
-- they have reached, and if they wear a lower stage it is swapped for the new one. Existing
-- helpers are credited at the end of this migration.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

insert into public.badges (key, sort_order) values
  ('bee_10', 20), ('bee_25', 21), ('bee_50', 22), ('bee_100', 23);

-- How many requests the user has helped complete, by the rules above. The backend shows it as
-- the bee's progress. Each requester's requests are walked in completion order, keeping the
-- counted ones of the last hour.
create or replace function public.helped_count(p_user uuid)
returns int
language plpgsql
stable
as $$
declare
  r         record;
  counted   int := 0;
  requester uuid;
  last_hour timestamptz[] := '{}';
begin
  for r in
    select q.requester_id, q.completed_at
    from public.requests q
    join public.profiles p on p.id = q.requester_id
    where q.helper_id = p_user
      and q.status = 'completed'
      and not q.moderation_flagged
      and q.completed_at >= q.accepted_at + interval '15 minutes'
      and q.completed_at >= p.created_at + interval '1 day'
    order by q.requester_id, q.completed_at
  loop
    if requester is distinct from r.requester_id then
      requester := r.requester_id;
      last_hour := '{}';
    end if;
    last_hour := array(
      select t from unnest(last_hour) t where t > r.completed_at - interval '1 hour'
    );
    if cardinality(last_hour) < 2 then
      counted := counted + 1;
      last_hour := last_hour || r.completed_at;
    end if;
  end loop;
  return counted;
end;
$$;

-- Gives the user every bee stage they have reached, and moves a worn lower stage up.
create or replace function public.grant_bee_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  helped int := public.helped_count(p_user);
  top    text;
begin
  insert into public.user_badges (user_id, badge)
  select p_user, s.key
  from (values ('bee_10', 10), ('bee_25', 25), ('bee_50', 50), ('bee_100', 100)) s(key, need)
  where helped >= s.need
  on conflict do nothing;

  select s.key into top
  from (values ('bee_10', 10), ('bee_25', 25), ('bee_50', 50), ('bee_100', 100)) s(key, need)
  where helped >= s.need
  order by s.need desc
  limit 1;

  if top is not null then
    update public.profiles
    set worn_badge = top
    where id = p_user
      and worn_badge in ('bee_10', 'bee_25', 'bee_50', 'bee_100')
      and worn_badge <> top;
  end if;
end;
$$;

create or replace function public.requests_grant_bee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.helper_id is not null then
    perform public.grant_bee_badges(new.helper_id);
  end if;
  return new;
end;
$$;

create trigger requests_grant_bee
  after update of status on public.requests
  for each row execute function public.requests_grant_bee();

revoke execute on function public.helped_count(uuid) from public, anon, authenticated;
revoke execute on function public.grant_bee_badges(uuid) from public, anon, authenticated;

-- Credit what has already been helped.
select public.grant_bee_badges(h.helper_id)
from (
  select distinct helper_id from public.requests
  where status = 'completed' and helper_id is not null
) h;

commit;
