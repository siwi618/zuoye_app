-- Literature tool: a weekly clean-up of tags no analysis uses any more (left behind when
-- analyses are deleted or edited). The Worker's weekly cron calls it.
--
-- Kept: tags under a day old (one may be in the middle of being attached to a new analysis)
-- and tags taken down by moderation (they keep that name blocked).
--
-- Wrapped in one transaction, so the function never exists without its permissions revoked.

begin;

create or replace function public.lit_delete_unused_tags()
returns integer
language sql
as $$
  with gone as (
    delete from public.lit_tags t
    where not t.moderation_flagged
      and t.created_at < now() - interval '1 day'
      and not exists (select 1 from public.lit_analysis_tags l where l.tag_id = t.id)
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.lit_delete_unused_tags() from public, anon, authenticated;

commit;
