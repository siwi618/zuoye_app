-- Literature tool: saving an edited analysis in one step.
--
-- The backend checks the edit first (the caller is the author, the quotes are ones the
-- analysis already covers, fragments fit the cited versions, the text passes moderation,
-- tags exist), then calls this function, which applies it atomically: either all of it is
-- saved or nothing is. Only the backend (service role) may call it.
--
-- Wrapped in one transaction, so the function never exists without its permissions revoked.

begin;

create or replace function public.lit_update_analysis(
  p_analysis_id uuid,
  p_body        text,
  p_moderated   boolean,
  p_quote_ids   uuid[],   -- the covered quotes to keep
  p_highlights  jsonb,    -- [{quote_id, number, start, end}]
  p_tag_ids     uuid[]
)
returns void
language plpgsql
as $$
begin
  -- Fragments are replaced wholesale; dropped quotes go, their fragments with them.
  delete from public.lit_highlights where analysis_id = p_analysis_id;
  delete from public.lit_analysis_quotes
  where analysis_id = p_analysis_id and quote_id <> all (p_quote_ids);

  insert into public.lit_highlights (analysis_id, quote_id, number, start_offset, end_offset)
  select p_analysis_id, (h ->> 'quote_id')::uuid, (h ->> 'number')::smallint,
         (h ->> 'start')::integer, (h ->> 'end')::integer
  from jsonb_array_elements(p_highlights) as h;

  delete from public.lit_analysis_tags
  where analysis_id = p_analysis_id and tag_id <> all (p_tag_ids);
  insert into public.lit_analysis_tags (analysis_id, tag_id)
  select p_analysis_id, t from unnest(p_tag_ids) as t
  on conflict do nothing;

  update public.lit_analyses set body = p_body, moderated = p_moderated
  where id = p_analysis_id;
end;
$$;

revoke execute on function public.lit_update_analysis(uuid, text, boolean, uuid[], jsonb, uuid[])
  from public, anon, authenticated;

commit;
