-- A fairer leaderboard.
--
-- 1. Only valid reviews count: a helper's review counts only if its request counts for 「雷蜂」
--    (migration 0026: 15+ minutes from accepting to completing, a requester at least a day old,
--    at most 2 per requester in any hour), and the review was not taken down by moderation.
--    counted_requests() now holds those rules for both, and helped_count() uses it.
-- 2. Ranking by a weighted score instead of the raw average: as if every helper also had C
--    imaginary reviews of m stars, score = (C·m + sum of ratings) / (C + n). A single 5-star
--    review no longer beats 40 reviews averaging 4.9.
-- 3. m and C are learnt from all valid reviews (empirical Bayes, method of moments):
--      m  = the mean of all valid ratings;
--      σ² = how much one helper's ratings vary (pooled over helpers with 2+ reviews);
--      τ² = how much helpers truly differ = variance of their means − average noise σ²/n;
--      C  = σ² / τ²: the more alike helpers are, the more reviews it takes to stand out.
--    C never goes below 5, the starting point Ken chose ("5 reviews of 4.5"): with fewer, a
--    helper with 3 five-star reviews could pass one with 40 averaging 4.9. It may grow to 20.
--    If helpers differ no more than chance would make them, C is 20. With too little data
--    (fewer than 3 helpers with 2+ reviews) it falls back to m = 4.5, C = 5; m is kept within
--    3.5–4.9.
-- 4. At least 3 valid reviews to be ranked, over the period shown.
-- 5. Two periods: all time, and this month (Asia/Shanghai). The month uses the m and C learnt
--    from all time, which is steadier.
--
-- leaderboard(period) returns every helper with a valid review in the period, ranked or not
-- (rank is null under 3 reviews), so the backend can also tell a user where they stand.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

-- The completed requests that count, with their helper; all helpers when p_helper is null.
-- Each helper's requests from each requester are walked in completion order, keeping the
-- counted ones of the last hour.
create or replace function public.counted_requests(p_helper uuid default null)
returns table (request_id uuid, helper_id uuid)
language plpgsql
stable
as $$
declare
  r         record;
  helper    uuid;
  requester uuid;
  last_hour timestamptz[] := '{}';
begin
  for r in
    select q.id, q.helper_id, q.requester_id, q.completed_at
    from public.requests q
    join public.profiles p on p.id = q.requester_id
    where (p_helper is null or q.helper_id = p_helper)
      and q.helper_id is not null
      and q.status = 'completed'
      and not q.moderation_flagged
      and q.completed_at >= q.accepted_at + interval '15 minutes'
      and q.completed_at >= p.created_at + interval '1 day'
    order by q.helper_id, q.requester_id, q.completed_at
  loop
    if helper is distinct from r.helper_id or requester is distinct from r.requester_id then
      helper := r.helper_id;
      requester := r.requester_id;
      last_hour := '{}';
    end if;
    last_hour := array(
      select t from unnest(last_hour) t where t > r.completed_at - interval '1 hour'
    );
    if cardinality(last_hour) < 2 then
      last_hour := last_hour || r.completed_at;
      request_id := r.id;
      helper_id := r.helper_id;
      return next;
    end if;
  end loop;
end;
$$;

-- Same rules as before (migration 0026), now from counted_requests().
create or replace function public.helped_count(p_user uuid)
returns int
language sql
stable
as $$
  select count(*)::int from public.counted_requests(p_user);
$$;

create or replace function public.leaderboard(p_period text default 'all')
returns table (
  user_id        uuid,
  avg_rating     numeric,
  feedback_count int,
  score          numeric,
  rank           int,
  prior_mean     numeric,
  prior_weight   numeric
)
language sql
stable
as $$
  with valid as (
    select f.to_user_id as helper, f.rating::numeric as rating, f.created_at
    from public.feedbacks f
    join public.counted_requests() c
      on c.request_id = f.request_id and c.helper_id = f.to_user_id
    join public.requests r on r.id = f.request_id
    join public.profiles rq on rq.id = r.requester_id
    join public.profiles hp on hp.id = f.to_user_id
    where not f.moderation_flagged
      and not rq.is_deleted
      and not hp.is_deleted
  ),
  per_helper as (
    select helper, count(*) as n, avg(rating) as mean, var_samp(rating) as v
    from valid
    group by helper
  ),
  moments as (
    select
      (select avg(rating) from valid) as m_raw,
      sum((n - 1) * v) / nullif(sum(n - 1), 0) as sigma2,
      var_samp(mean) as var_means,
      avg(1.0 / n) as avg_inv_n,
      count(*) as helpers
    from per_helper
    where n >= 2
  ),
  prior as (
    select
      case when helpers < 3 then 4.5 else least(4.9, greatest(3.5, m_raw)) end as m,
      case
        when helpers < 3 or sigma2 is null or var_means is null then 5
        -- helpers no more different than chance: it takes many reviews to stand out
        when var_means - sigma2 * avg_inv_n < 0.01 then 20
        else least(20, greatest(5, sigma2 / (var_means - sigma2 * avg_inv_n)))
      end as c
    from moments
  ),
  period as (
    select helper, count(*)::int as n, avg(rating) as mean, max(created_at) as last_at
    from valid
    where p_period = 'all'
       or created_at >= (date_trunc('month', now() at time zone 'Asia/Shanghai')
                         at time zone 'Asia/Shanghai')
    group by helper
  ),
  scored as (
    select p.helper, p.n, p.mean, (prior.c * prior.m + p.n * p.mean) / (prior.c + p.n) as score,
           p.last_at, prior.m, prior.c
    from period p cross join prior
  )
  select
    helper,
    round(mean, 2),
    n,
    round(score, 3),
    case when n >= 3 then
      (row_number() over (order by (n >= 3) desc, score desc, n desc, last_at))::int
    end,
    round(m, 3),
    round(c, 2)
  from scored
  order by (n >= 3) desc, score desc, n desc, last_at;
$$;

revoke execute on function public.counted_requests(uuid) from public, anon, authenticated;
revoke execute on function public.helped_count(uuid) from public, anon, authenticated;
revoke execute on function public.leaderboard(text) from public, anon, authenticated;

commit;
