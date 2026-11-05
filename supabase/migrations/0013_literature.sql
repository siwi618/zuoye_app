-- Literature tool (/tools/literature): students' quotes from a work, #device tags, and
-- analyses that cite highlighted fragments of those quotes.
--
-- Works themselves are a static list in the frontend (lib/literature/corpus.ts) and are
-- referred to here by their key (e.g. 'chess'). Like the forum, writes go through the
-- backend (service role) and authenticated users only get SELECT.
--
-- Wrapped in one transaction: if any statement fails, nothing is created.

begin;

-- =========================================================
-- lit_quotes: a passage of a work, with the pages it spans
-- =========================================================
create table public.lit_quotes (
  id                  uuid        primary key default gen_random_uuid(),
  work_key            text        not null check (work_key ~ '^[a-z0-9-]{1,40}$'),
  author_id           uuid        not null references public.profiles(id) on delete cascade,
  body                text        not null check (char_length(body) between 1 and 2000),
  page_start          integer     not null check (page_start between 1 and 9999),
  page_end            integer     not null check (page_end between page_start and 9999),
  moderated           boolean     not null default false,
  moderation_flagged  boolean     not null default false,
  created_at          timestamptz not null default now()
);

create index lit_quotes_work_idx on public.lit_quotes (work_key, page_start, page_end, created_at);
create index lit_quotes_unmoderated_idx on public.lit_quotes (id) where not moderated;

-- =========================================================
-- lit_tags: #device tags, shared by every work; names are unique ignoring case
-- =========================================================
create table public.lit_tags (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null check (char_length(name) between 1 and 20
                                                  and name !~ '[#()（）\s]'),
  created_by          uuid        not null references public.profiles(id) on delete cascade,
  moderated           boolean     not null default false,
  moderation_flagged  boolean     not null default false,
  created_at          timestamptz not null default now()
);

create unique index lit_tags_name_idx on public.lit_tags (lower(name));
create index lit_tags_unmoderated_idx on public.lit_tags (id) where not moderated;

-- =========================================================
-- lit_analyses: one student's analysis of some quotes of a work
-- =========================================================
create table public.lit_analyses (
  id                  uuid        primary key default gen_random_uuid(),
  work_key            text        not null check (work_key ~ '^[a-z0-9-]{1,40}$'),
  author_id           uuid        not null references public.profiles(id) on delete cascade,
  body                text        not null check (char_length(body) between 1 and 5000),
  moderated           boolean     not null default false,
  moderation_flagged  boolean     not null default false,
  created_at          timestamptz not null default now()
);

create index lit_analyses_work_idx on public.lit_analyses (work_key, created_at desc);
create index lit_analyses_unmoderated_idx on public.lit_analyses (id) where not moderated;

-- The quotes an analysis covers, in the order they are shown above it.
create table public.lit_analysis_quotes (
  analysis_id  uuid     not null references public.lit_analyses(id) on delete cascade,
  quote_id     uuid     not null references public.lit_quotes(id) on delete restrict,
  position     smallint not null,
  primary key (analysis_id, quote_id)
);

create index lit_analysis_quotes_quote_idx on public.lit_analysis_quotes (quote_id);

-- Highlighted fragments ("引文N"): characters [start_offset, end_offset) of a covered quote.
-- Numbers stay as the author gave them, so「(引文N)」in the body keeps pointing at its fragment.
create table public.lit_highlights (
  analysis_id   uuid     not null,
  quote_id      uuid     not null,
  number        smallint not null check (number between 1 and 99),
  start_offset  integer  not null check (start_offset >= 0),
  end_offset    integer  not null check (end_offset > start_offset),
  primary key (analysis_id, number),
  foreign key (analysis_id, quote_id)
    references public.lit_analysis_quotes (analysis_id, quote_id) on delete cascade
);

create table public.lit_analysis_tags (
  analysis_id  uuid not null references public.lit_analyses(id) on delete cascade,
  tag_id       uuid not null references public.lit_tags(id) on delete cascade,
  primary key (analysis_id, tag_id)
);

create index lit_analysis_tags_tag_idx on public.lit_analysis_tags (tag_id);

-- =========================================================
-- RLS: authenticated can read; writes via backend only
-- =========================================================
alter table public.lit_quotes          enable row level security;
alter table public.lit_tags            enable row level security;
alter table public.lit_analyses        enable row level security;
alter table public.lit_analysis_quotes enable row level security;
alter table public.lit_highlights      enable row level security;
alter table public.lit_analysis_tags   enable row level security;

create policy "lit_quotes: authenticated can read all"
  on public.lit_quotes for select to authenticated using (true);
create policy "lit_tags: authenticated can read all"
  on public.lit_tags for select to authenticated using (true);
create policy "lit_analyses: authenticated can read all"
  on public.lit_analyses for select to authenticated using (true);
create policy "lit_analysis_quotes: authenticated can read all"
  on public.lit_analysis_quotes for select to authenticated using (true);
create policy "lit_highlights: authenticated can read all"
  on public.lit_highlights for select to authenticated using (true);
create policy "lit_analysis_tags: authenticated can read all"
  on public.lit_analysis_tags for select to authenticated using (true);

-- =========================================================
-- Moderation: notify authors of taken-down content, and queue unchecked rows
-- =========================================================
create trigger lit_quotes_notify_flagged
  after update of moderation_flagged on public.lit_quotes
  for each row execute function public.notify_moderation_flagged('author_id');

create trigger lit_tags_notify_flagged
  after update of moderation_flagged on public.lit_tags
  for each row execute function public.notify_moderation_flagged('created_by');

create trigger lit_analyses_notify_flagged
  after update of moderation_flagged on public.lit_analyses
  for each row execute function public.notify_moderation_flagged('author_id');

create or replace view public.moderation_queue as
select 'profiles' as source, p.id
from public.profiles p
where not p.moderated and not p.is_deleted

union all
select 'requests', r.id
from public.requests r
join public.profiles rq on rq.id = r.requester_id
left join public.profiles hp on hp.id = r.helper_id
where not r.moderated and not rq.is_deleted and not coalesce(hp.is_deleted, false)

union all
select 'feedbacks', f.id
from public.feedbacks f
join public.profiles fu on fu.id = f.from_user_id
join public.profiles tu on tu.id = f.to_user_id
where not f.moderated and not fu.is_deleted and not tu.is_deleted

union all
select 'forum_posts', fp.id
from public.forum_posts fp
join public.profiles a on a.id = fp.author_id
where not fp.moderated and not a.is_deleted

union all
select 'forum_comments', fc.id
from public.forum_comments fc
join public.profiles a  on a.id  = fc.author_id
join public.forum_posts fp on fp.id = fc.post_id
join public.profiles pa on pa.id = fp.author_id
where not fc.moderated and not a.is_deleted and not pa.is_deleted

union all
select 'media', m.id
from public.media m
join public.profiles o on o.id = m.owner_id
where not m.moderated and not o.is_deleted

union all
select 'request_messages', rm.id
from public.request_messages rm
join public.profiles s on s.id = rm.sender_id
where not rm.moderated and not s.is_deleted

union all
select 'lit_quotes', q.id
from public.lit_quotes q
join public.profiles a on a.id = q.author_id
where not q.moderated and not a.is_deleted

union all
select 'lit_tags', t.id
from public.lit_tags t
join public.profiles a on a.id = t.created_by
where not t.moderated and not a.is_deleted

union all
select 'lit_analyses', la.id
from public.lit_analyses la
join public.profiles a on a.id = la.author_id
where not la.moderated and not a.is_deleted;

revoke all on public.moderation_queue from anon, authenticated;

commit;
