-- Literature tool: introductions anyone can edit, for each work and each #device.
--
-- Every save is a new version (like quote versions), so nothing is lost and an older text can
-- be brought back; the newest visible version is the one shown. A device's introduction is
-- keyed by its name in lower case, so it survives the weekly clean-up of unused tags.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

create table public.lit_intro_versions (
  id                  uuid        primary key default gen_random_uuid(),
  subject_kind        text        not null check (subject_kind in ('work', 'device')),
  subject_key         text        not null check (char_length(subject_key) between 1 and 40),
  number              smallint    not null check (number >= 1),
  body                text        not null check (char_length(body) <= 500),
  edited_by           uuid        not null references public.profiles(id) on delete cascade,
  moderated           boolean     not null default false,
  moderation_flagged  boolean     not null default false,
  created_at          timestamptz not null default now(),
  unique (subject_kind, subject_key, number)
);

create index lit_intro_versions_unmoderated_idx on public.lit_intro_versions (id) where not moderated;

alter table public.lit_intro_versions enable row level security;

create policy "lit_intro_versions: authenticated can read all"
  on public.lit_intro_versions for select to authenticated using (true);

create trigger lit_intro_versions_notify_flagged
  after update of moderation_flagged on public.lit_intro_versions
  for each row execute function public.notify_moderation_flagged('edited_by');

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
where not la.moderated and not a.is_deleted

union all
select 'lit_intro_versions', iv.id
from public.lit_intro_versions iv
join public.profiles a on a.id = iv.edited_by
where not iv.moderated and not a.is_deleted;

revoke all on public.moderation_queue from anon, authenticated;

commit;
