-- 「现代最强」: a mythic dome crown for whoever has won 「月度冠军」 (migration 0030) the most
-- times, one holder at a time, alongside 「史上最强」 (migration 0031) for the all-time first.
-- On a tie the holder is whoever reached that many wins first: a challenger must win more to
-- take it, not just as many. Deleted users don't hold it. When someone else becomes the holder
-- the crown moves: the old holder's row is deleted (which also takes it off if they wear it, by
-- the worn_badge foreign key of migration 0025) and the new holder gets one, so their red dot
-- for a new badge shows. Nobody holds it until a month has a champion.
--
-- update_modern_top() does the check; the Worker runs it every 10 minutes with
-- update_all_time_top() (src/index.ts), so it follows each month's settlement within minutes.
-- It runs once at the end of this migration.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

insert into public.badges (key, sort_order) values ('modern_top', 55);

-- Gives the crown to whoever has the most monthly wins, taking it from anyone else; returns
-- the holder.
create or replace function public.update_modern_top()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  top uuid;
begin
  select c.user_id into top
  from public.monthly_champions c
  join public.profiles p on p.id = c.user_id
  where not p.is_deleted
  group by c.user_id
  -- the latest win is when a user reached their count
  order by count(*) desc, max(c.month)
  limit 1;

  delete from public.user_badges
  where badge = 'modern_top' and user_id is distinct from top;

  if top is not null then
    insert into public.user_badges (user_id, badge) values (top, 'modern_top')
    on conflict (user_id, badge) do nothing;
  end if;
  return top;
end;
$$;

revoke execute on function public.update_modern_top() from public, anon, authenticated;

select public.update_modern_top();

commit;
