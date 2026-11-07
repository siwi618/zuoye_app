-- 「史上最强」: a mythic crown for whoever is first on the all-time leaderboard (migration 0029),
-- one holder at a time. When someone else takes first place the crown moves: the old holder's
-- row is deleted (which also takes it off if they wear it, by the worn_badge foreign key of
-- migration 0025) and the new holder gets one, so their red dot for a new badge shows. Nobody
-- holds it while nobody is ranked.
--
-- update_all_time_top() does the check; the Worker runs it every 10 minutes (src/index.ts),
-- and it runs once at the end of this migration.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

insert into public.badges (key, sort_order) values ('all_time_top', 50);

-- Gives the crown to the all-time first, taking it from anyone else; returns the holder.
create or replace function public.update_all_time_top()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  top uuid;
begin
  select l.user_id into top from public.leaderboard('all') l where l.rank = 1;

  delete from public.user_badges
  where badge = 'all_time_top' and user_id is distinct from top;

  if top is not null then
    insert into public.user_badges (user_id, badge) values (top, 'all_time_top')
    on conflict (user_id, badge) do nothing;
  end if;
  return top;
end;
$$;

revoke execute on function public.update_all_time_top() from public, anon, authenticated;

select public.update_all_time_top();

commit;
