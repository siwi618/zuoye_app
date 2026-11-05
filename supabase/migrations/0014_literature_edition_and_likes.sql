-- Literature tool: an optional edition / publisher on quotes (page numbers differ between
-- editions), and likes on analyses.
--
-- Like the forum, like_count is denormalised onto lit_analyses and kept in sync by a
-- trigger; likes are written through the backend (service role).
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

-- e.g. 「人民文学出版社 2010」; empty = not given.
alter table public.lit_quotes
  add column edition text check (edition is null or char_length(edition) between 1 and 60);

alter table public.lit_analyses add column like_count integer not null default 0;

create table public.lit_analysis_likes (
  analysis_id  uuid        not null references public.lit_analyses(id) on delete cascade,
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (analysis_id, user_id)
);

create index lit_analysis_likes_user_idx on public.lit_analysis_likes (user_id);

create or replace function public.lit_sync_analysis_like_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.lit_analyses set like_count = like_count + 1 where id = new.analysis_id;
  else
    update public.lit_analyses set like_count = like_count - 1 where id = old.analysis_id;
  end if;
  return null;
end;
$$;

create trigger lit_analysis_likes_count
  after insert or delete on public.lit_analysis_likes
  for each row execute function public.lit_sync_analysis_like_count();

alter table public.lit_analysis_likes enable row level security;

create policy "lit_analysis_likes: authenticated can read all"
  on public.lit_analysis_likes for select to authenticated using (true);

commit;
