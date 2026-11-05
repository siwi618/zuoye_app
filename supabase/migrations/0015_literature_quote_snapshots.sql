-- Literature tool: an analysis keeps the quotes it covers as they were when it was published.
--
-- Quotes may become editable by everyone later; a published analysis must not change with
-- them. lit_analysis_quotes now holds a copy of each covered quote's text, pages and edition,
-- and highlight offsets refer to that copy. Existing rows are filled from the quotes as they
-- are now.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

alter table public.lit_analysis_quotes
  add column body       text,
  add column page_start integer,
  add column page_end   integer,
  add column edition    text;

update public.lit_analysis_quotes aq
set body = q.body, page_start = q.page_start, page_end = q.page_end, edition = q.edition
from public.lit_quotes q
where q.id = aq.quote_id;

alter table public.lit_analysis_quotes
  alter column body       set not null,
  alter column page_start set not null,
  alter column page_end   set not null,
  add constraint lit_analysis_quotes_body_check
    check (char_length(body) between 1 and 2000),
  add constraint lit_analysis_quotes_pages_check
    check (page_start between 1 and 9999 and page_end between page_start and 9999);

comment on column public.lit_analysis_quotes.body is
  'The quote as it was when the analysis was published; highlight offsets refer to this text.';

commit;
