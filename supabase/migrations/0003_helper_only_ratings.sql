-- Restrict the leaderboard to ratings users earned *as helpers*.
--
-- The original view counted any feedback received, but a request generates two
-- feedbacks (helper rates requester, requester rates helper). For a "top helpers"
-- leaderboard we only want feedback whose recipient was the helper on that request.

drop view if exists public.user_ratings;

create view public.user_ratings as
select
  f.to_user_id                          as user_id,
  round(avg(f.rating)::numeric, 2)      as avg_rating,
  count(*)                              as feedback_count
from public.feedbacks f
join public.requests  r on r.id = f.request_id
where f.to_user_id = r.helper_id
group by f.to_user_id;

comment on view public.user_ratings is
  'Per-user helper rating (averages only feedback given to the helper of a request). Drives the leaderboard.';

grant select on public.user_ratings to authenticated;
