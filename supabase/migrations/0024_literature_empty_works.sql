-- Literature tool: the works nothing has been written under yet (no quotes, analyses or
-- @character tags), in one query. Holders of the 「鱼果」 badge may delete those, and the works
-- list shows a bin on each; until now the frontend fetched every work's page to find out.
-- Each check uses the work_key index of its table. Only the backend (service role) may call it.
--
-- Wrapped in one transaction, so the function never exists without its permissions revoked.

begin;

create or replace function public.lit_empty_works()
returns table (key text)
language sql
stable
as $$
  select w.key
  from public.lit_works w
  where not exists (select 1 from public.lit_quotes q where q.work_key = w.key)
    and not exists (select 1 from public.lit_analyses a where a.work_key = w.key)
    and not exists (select 1 from public.lit_tags t where t.work_key = w.key)
  order by w.created_at;
$$;

revoke execute on function public.lit_empty_works() from public, anon, authenticated;

commit;
