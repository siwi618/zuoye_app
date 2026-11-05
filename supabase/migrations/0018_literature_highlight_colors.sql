-- Literature tool: highlighter colours. A fragment can be marked in yellow (as until now),
-- light blue, pink or light green; existing fragments stay yellow. lit_update_analysis() now
-- saves each fragment's colour too.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

alter table public.lit_highlights
  add column color text not null default 'amber'
  check (color in ('amber', 'sky', 'pink', 'lime'));

create or replace function public.lit_update_analysis(
  p_analysis_id uuid,
  p_body        text,
  p_moderated   boolean,
  p_quote_ids   uuid[],   -- the covered quotes to keep
  p_highlights  jsonb,    -- [{quote_id, number, start, end, color}]
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

  insert into public.lit_highlights
    (analysis_id, quote_id, number, start_offset, end_offset, color)
  select p_analysis_id, (h ->> 'quote_id')::uuid, (h ->> 'number')::smallint,
         (h ->> 'start')::integer, (h ->> 'end')::integer,
         coalesce(h ->> 'color', 'amber')
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
