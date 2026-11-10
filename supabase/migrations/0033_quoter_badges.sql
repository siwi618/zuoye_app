-- 「钳书童」: a third evolving badge, for gathering literature quotes (钳 is a crab's pincer
-- picking sentences out of a book; 钳钟书 is 钱钟书, famed for his reading notes and the
-- quotations of 《管锥编》). A quote counts once for a user, against farming, only when another
-- user's analysis (not taken down by moderation) cites it, the quote is not taken down either, and:
--   - the user posted the quote at least 30 minutes ago (any version cited counts for them), or
--   - the user made the version cited (整理) at least 30 minutes ago.
-- Crediting the poster for every version keeps a light edit from taking a quote's credit away.
-- The stages:
--    3 → quoter_3  「钳书童」 common
--   10 → quoter_10 「钳书生」 epic
--   25 → quoter_25 「钳书痴」 legendary
--   50 → quoter_50 「钳钟书」 mythic
-- Like 「鲷苗人」 (migration 0028), each stage is its own badge, a worn lower stage moves up, and
-- the badge wall shows the highest stage with its progress.
--
-- When an analysis cites a quote, the quote's poster and the cited version's maker get the stages
-- reached right away. A quote cited sooner than 30 minutes after it was posted or edited counts
-- once that time has passed; the backend checks again whenever the user's badges are fetched.
-- Existing quotes are credited at the end.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

insert into public.badges (key, sort_order) values
  ('quoter_3', 34), ('quoter_10', 35), ('quoter_25', 36), ('quoter_50', 37);

create index lit_quotes_author_idx on public.lit_quotes (author_id);
create index lit_quote_versions_editor_idx on public.lit_quote_versions (edited_by);

-- How many quotes count for the user, by the rules above. The backend shows it as progress.
create or replace function public.counted_quotes(p_user uuid)
returns int
language sql
stable
as $$
  select count(*)::int
  from (
    select q.id
    from public.lit_quotes q
    where q.author_id = p_user
      and not q.moderation_flagged
      and q.created_at <= now() - interval '30 minutes'
      and exists (
        select 1
        from public.lit_analysis_quotes aq
        join public.lit_analyses a on a.id = aq.analysis_id
        where aq.quote_id = q.id and a.author_id <> p_user and not a.moderation_flagged
      )
    union
    select q.id
    from public.lit_quote_versions v
    join public.lit_quotes q on q.id = v.quote_id
    where v.edited_by = p_user
      and not q.moderation_flagged
      and v.created_at <= now() - interval '30 minutes'
      and exists (
        select 1
        from public.lit_analysis_quotes aq
        join public.lit_analyses a on a.id = aq.analysis_id
        where aq.version_id = v.id and a.author_id <> p_user and not a.moderation_flagged
      )
  ) counted;
$$;

-- Gives the user every quoter stage they have reached, and moves a worn lower stage up.
create or replace function public.grant_quoter_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  quoted int := public.counted_quotes(p_user);
  top    text;
begin
  insert into public.user_badges (user_id, badge)
  select p_user, s.key
  from (values ('quoter_3', 3), ('quoter_10', 10), ('quoter_25', 25), ('quoter_50', 50)) s(key, need)
  where quoted >= s.need
  on conflict do nothing;

  select s.key into top
  from (values ('quoter_3', 3), ('quoter_10', 10), ('quoter_25', 25), ('quoter_50', 50)) s(key, need)
  where quoted >= s.need
  order by s.need desc
  limit 1;

  if top is not null then
    update public.profiles
    set worn_badge = top
    where id = p_user
      and worn_badge in ('quoter_3', 'quoter_10', 'quoter_25', 'quoter_50')
      and worn_badge <> top;
  end if;
end;
$$;

create or replace function public.lit_analysis_quotes_grant_quoter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.grant_quoter_badges(u.id)
  from (
    select author_id as id from public.lit_quotes where id = new.quote_id
    union
    select edited_by from public.lit_quote_versions where id = new.version_id
  ) u;
  return new;
end;
$$;

create trigger lit_analysis_quotes_grant_quoter
  after insert on public.lit_analysis_quotes
  for each row execute function public.lit_analysis_quotes_grant_quoter();

revoke execute on function public.counted_quotes(uuid) from public, anon, authenticated;
revoke execute on function public.grant_quoter_badges(uuid) from public, anon, authenticated;

-- Credit what has already been cited.
select public.grant_quoter_badges(u.id)
from (
  select q.author_id as id
  from public.lit_analysis_quotes aq join public.lit_quotes q on q.id = aq.quote_id
  union
  select v.edited_by
  from public.lit_analysis_quotes aq join public.lit_quote_versions v on v.id = aq.version_id
) u;

commit;
