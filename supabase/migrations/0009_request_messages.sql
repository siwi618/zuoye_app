-- Private chat between the requester and the helper of an accepted request.
--
-- Read and written only through the backend (service role), which checks
-- that the caller is one of the two participants. RLS is on with no
-- policies, so clients can't read the table directly.

create table public.request_messages (
  id                  uuid        primary key default gen_random_uuid(),
  request_id          uuid        not null references public.requests(id) on delete cascade,
  sender_id           uuid        not null references public.profiles(id) on delete cascade,
  body                text        not null check (char_length(body) between 1 and 1000),
  moderated           boolean     not null default false,
  moderation_flagged  boolean     not null default false,
  created_at          timestamptz not null default now()
);

create index request_messages_request_idx on public.request_messages (request_id, created_at);
create index request_messages_unmoderated_idx on public.request_messages (id) where not moderated;

alter table public.request_messages enable row level security;

create trigger request_messages_notify_flagged
  after update of moderation_flagged on public.request_messages
  for each row execute function public.notify_moderation_flagged('sender_id');

-- =========================================================
-- moderation_queue: add request_messages (still skipping soft-deleted users)
-- =========================================================
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
where not rm.moderated and not s.is_deleted;

revoke all on public.moderation_queue from anon, authenticated;
