-- Literature tool: quotes get versions, and an analysis cites the version it was written on.
--
-- Quotes may become editable by everyone later; a published analysis must not change with
-- them. Each version of a quote is stored once in lit_quote_versions (however many analyses
-- cite it), and lit_analysis_quotes records which version each analysis covers; highlight
-- offsets refer to that version's text. lit_quotes keeps the current text, pages and edition,
-- which are always those of its latest version. Existing quotes become version 1, and existing
-- analyses cite it.
--
-- Note for PostgREST: with this table, lit_quotes reaches profiles a second way (through the
-- versions' edited_by), so embeds of a quote's author must name the foreign key:
-- profiles!lit_quotes_author_id_fkey(...).
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

create table public.lit_quote_versions (
  id          uuid        primary key default gen_random_uuid(),
  quote_id    uuid        not null references public.lit_quotes(id) on delete cascade,
  number      smallint    not null check (number >= 1),
  body        text        not null check (char_length(body) between 1 and 2000),
  page_start  integer     not null check (page_start between 1 and 9999),
  page_end    integer     not null check (page_end between page_start and 9999),
  edition     text        check (edition is null or char_length(edition) between 1 and 60),
  edited_by   uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (quote_id, number),
  -- lets lit_analysis_quotes check that the version belongs to the quote it names
  unique (id, quote_id)
);

insert into public.lit_quote_versions
  (quote_id, number, body, page_start, page_end, edition, edited_by, created_at)
select id, 1, body, page_start, page_end, edition, author_id, created_at
from public.lit_quotes;

-- A new quote starts as its version 1.
create or replace function public.lit_quote_first_version()
returns trigger
language plpgsql
as $$
begin
  insert into public.lit_quote_versions
    (quote_id, number, body, page_start, page_end, edition, edited_by, created_at)
  values
    (new.id, 1, new.body, new.page_start, new.page_end, new.edition, new.author_id,
     new.created_at);
  return null;
end;
$$;

create trigger lit_quotes_first_version
  after insert on public.lit_quotes
  for each row execute function public.lit_quote_first_version();

alter table public.lit_analysis_quotes add column version_id uuid;

update public.lit_analysis_quotes aq
set version_id = v.id
from public.lit_quote_versions v
where v.quote_id = aq.quote_id and v.number = 1;

alter table public.lit_analysis_quotes
  alter column version_id set not null,
  add constraint lit_analysis_quotes_version_fkey
    foreign key (version_id, quote_id)
    references public.lit_quote_versions (id, quote_id) on delete restrict;

create index lit_analysis_quotes_version_idx on public.lit_analysis_quotes (version_id);

alter table public.lit_quote_versions enable row level security;

create policy "lit_quote_versions: authenticated can read all"
  on public.lit_quote_versions for select to authenticated using (true);

commit;
