-- Literature tool: publishing an analysis in one step.
--
-- Until now the backend wrote the analysis, then its quotes, fragments and tags one request at
-- a time, deleting the analysis again if a later step failed; a dropped connection or a restart
-- in between could leave a half-written analysis. The backend still checks everything first
-- (quotes, fragments against the cited versions, moderation, tags), then calls this function,
-- which writes it all in one transaction and returns the new analysis's id and time. Only the
-- backend (service role) may call it.
--
-- Wrapped in one transaction, so the function never exists without its permissions revoked.

begin;

create or replace function public.lit_create_analysis(
  p_work_key   text,
  p_author_id  uuid,
  p_body       text,
  p_moderated  boolean,
  p_quotes     jsonb,   -- [{quote_id, version_id}], in the order they are shown
  p_highlights jsonb,   -- [{quote_id, number, start, end, color}]
  p_tag_ids    uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  new_id  uuid;
  made_at timestamptz;
begin
  insert into public.lit_analyses (work_key, author_id, body, moderated)
  values (p_work_key, p_author_id, p_body, p_moderated)
  returning id, created_at into new_id, made_at;

  insert into public.lit_analysis_quotes (analysis_id, quote_id, position, version_id)
  select new_id, (q ->> 'quote_id')::uuid, (i - 1)::smallint, (q ->> 'version_id')::uuid
  from jsonb_array_elements(p_quotes) with ordinality as e(q, i);

  insert into public.lit_highlights
    (analysis_id, quote_id, number, start_offset, end_offset, color)
  select new_id, (h ->> 'quote_id')::uuid, (h ->> 'number')::smallint,
         (h ->> 'start')::integer, (h ->> 'end')::integer,
         coalesce(h ->> 'color', 'amber')
  from jsonb_array_elements(p_highlights) as h;

  insert into public.lit_analysis_tags (analysis_id, tag_id)
  select new_id, t from unnest(p_tag_ids) as t
  on conflict do nothing;

  return jsonb_build_object('id', new_id, 'created_at', made_at);
end;
$$;

revoke execute on function public.lit_create_analysis(text, uuid, text, boolean, jsonb, jsonb, uuid[])
  from public, anon, authenticated;

commit;
