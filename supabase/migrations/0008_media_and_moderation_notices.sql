-- Image / video attachments, and notices for users whose content was taken down.
--
-- Media files live in the public Storage bucket "media" under <owner_id>/.
-- The backend uploads them (service role) only after moderation, records a
-- row in public.media, and content rows reference them via media_ids.

-- =========================================================
-- Storage bucket (20 MB per file; images and short videos)
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do nothing;

-- =========================================================
-- media
-- =========================================================
create table public.media (
  id                  uuid        primary key default gen_random_uuid(),
  owner_id            uuid        not null references public.profiles(id) on delete cascade,
  path                text        not null unique,   -- object path inside the "media" bucket
  kind                text        not null check (kind in ('image', 'video')),
  mime_type           text        not null,
  size_bytes          integer     not null,
  moderated           boolean     not null default false,
  moderation_flagged  boolean     not null default false,
  created_at          timestamptz not null default now()
);

create index media_owner_idx       on public.media (owner_id);
create index media_unmoderated_idx on public.media (id) where not moderated;

alter table public.media enable row level security;

create policy "media: authenticated can read all"
  on public.media for select to authenticated using (true);

alter table public.requests       add column media_ids uuid[] not null default '{}';
alter table public.forum_posts    add column media_ids uuid[] not null default '{}';
alter table public.forum_comments add column media_ids uuid[] not null default '{}';

-- =========================================================
-- moderation_notices: one per piece of content taken down
-- =========================================================
create table public.moderation_notices (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  source      text        not null,   -- table the content lives in
  item_id     uuid        not null,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz
);

create index moderation_notices_unseen_idx on public.moderation_notices (user_id) where seen_at is null;

alter table public.moderation_notices enable row level security;

create policy "moderation_notices: user can read own"
  on public.moderation_notices for select to authenticated using (auth.uid() = user_id);

-- Whenever moderation_flagged flips to true — by the sweep or by an admin in
-- the dashboard — notify the content's author. TG_ARGV[0] names the column
-- holding the author's id.
create or replace function public.notify_moderation_flagged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  if new.moderation_flagged and not old.moderation_flagged then
    execute format('select ($1).%I', tg_argv[0]) using new into author;
    insert into public.moderation_notices (user_id, source, item_id)
    values (author, tg_table_name, new.id);
  end if;
  return new;
end;
$$;

create trigger requests_notify_flagged
  after update of moderation_flagged on public.requests
  for each row execute function public.notify_moderation_flagged('requester_id');

create trigger feedbacks_notify_flagged
  after update of moderation_flagged on public.feedbacks
  for each row execute function public.notify_moderation_flagged('from_user_id');

create trigger forum_posts_notify_flagged
  after update of moderation_flagged on public.forum_posts
  for each row execute function public.notify_moderation_flagged('author_id');

create trigger forum_comments_notify_flagged
  after update of moderation_flagged on public.forum_comments
  for each row execute function public.notify_moderation_flagged('author_id');

create trigger media_notify_flagged
  after update of moderation_flagged on public.media
  for each row execute function public.notify_moderation_flagged('owner_id');

-- =========================================================
-- moderation_queue: add media (still skipping soft-deleted users)
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
where not m.moderated and not o.is_deleted;

revoke all on public.moderation_queue from anon, authenticated;
