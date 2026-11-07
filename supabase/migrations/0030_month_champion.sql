-- 「月度冠军」: an epic badge for the helper ranked first on a month's leaderboard (migration
-- 0029's month view: valid reviews only, weighted score, at least 3 reviews that month).
--
-- monthly_champions keeps one row per settled month. settle_month_champion() settles last month
-- if it isn't yet: it records the champion and gives them the badge; winning again moves the
-- badge's granted_at to now, so the red dot for a new badge shows again. A month nobody qualified
-- for is recorded with no champion, so it isn't looked at again. The Worker runs it every day just
-- after midnight in China (wrangler.jsonc), so a missed run catches up the next day.
--
-- leaderboard() gains p_month, to rank a past month; the month view without it is this month,
-- as before. The old one-argument function is dropped so the two can't be confused.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

insert into public.badges (key, sort_order) values ('month_champion', 40);

drop function public.leaderboard(text);

create function public.leaderboard(p_period text default 'all', p_month date default null)
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
  -- The month shown: p_month's, or this month's (both Asia/Shanghai local time).
  month_start as (
    select coalesce(
      date_trunc('month', p_month::timestamp),
      date_trunc('month', now() at time zone 'Asia/Shanghai')
    ) as local_start
  ),
  period as (
    select helper, count(*)::int as n, avg(rating) as mean, max(created_at) as last_at
    from valid cross join month_start
    where p_period = 'all'
       or (created_at >= (month_start.local_start at time zone 'Asia/Shanghai')
           and created_at < ((month_start.local_start + interval '1 month') at time zone 'Asia/Shanghai'))
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

create table public.monthly_champions (
  month           date        primary key check (month = date_trunc('month', month)),
  user_id         uuid        references public.profiles(id) on delete set null,
  score           numeric,
  avg_rating      numeric,
  feedback_count  int,
  settled_at      timestamptz not null default now()
);
create index monthly_champions_user_idx on public.monthly_champions (user_id);
alter table public.monthly_champions enable row level security;

-- Settles last month (Asia/Shanghai) if not yet; returns its champion, null if nobody qualified.
create or replace function public.settle_month_champion()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  last_month date := (date_trunc('month', now() at time zone 'Asia/Shanghai')
                      - interval '1 month')::date;
  top        record;
begin
  if exists (select 1 from public.monthly_champions where month = last_month) then
    return (select user_id from public.monthly_champions where month = last_month);
  end if;

  select l.user_id, l.score, l.avg_rating, l.feedback_count into top
  from public.leaderboard('month', last_month) l
  where l.rank = 1;

  insert into public.monthly_champions (month, user_id, score, avg_rating, feedback_count)
  values (last_month, top.user_id, top.score, top.avg_rating, top.feedback_count);

  if top.user_id is not null then
    insert into public.user_badges (user_id, badge) values (top.user_id, 'month_champion')
    on conflict (user_id, badge) do update set granted_at = now();
  end if;
  return top.user_id;
end;
$$;

revoke execute on function public.leaderboard(text, date) from public, anon, authenticated;
revoke execute on function public.settle_month_champion() from public, anon, authenticated;

commit;
