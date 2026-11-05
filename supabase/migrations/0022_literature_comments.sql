-- Literature tool: comments on analyses, like the forum's (two levels: a reply always belongs
-- to a top-level comment's thread and names whose comment it answers), with likes, but no
-- attachments. lit_analyses.comment_count counts every comment and reply, kept by triggers.
--
-- For PostgREST: comments reach profiles two ways (author_id, reply_to_user_id), so embeds of
-- a comment's author must name the key: profiles!lit_analysis_comments_author_id_fkey(...).
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

create table public.lit_analysis_comments (
  id                  uuid        primary key default gen_random_uuid(),
  analysis_id         uuid        not null references public.lit_analyses(id) on delete cascade,
  author_id           uuid        not null references public.profiles(id) on delete cascade,
  body                text        not null check (char_length(body) between 1 and 2000),
  -- null: a top-level comment; set: a reply, pointing at its thread's top-level comment.
  parent_id           uuid        references public.lit_analysis_comments(id) on delete cascade,
  reply_to_user_id    uuid        references public.profiles(id) on delete set null,
  like_count          integer     not null default 0,
  moderated           boolean     not null default false,
  moderation_flagged  boolean     not null default false,
  created_at          timestamptz not null default now()
);

create index lit_analysis_comments_analysis_idx
  on public.lit_analysis_comments (analysis_id, created_at);
create index lit_analysis_comments_parent_idx
  on public.lit_analysis_comments (parent_id) where parent_id is not null;
create index lit_analysis_comments_unmoderated_idx
  on public.lit_analysis_comments (id) where not moderated;

create table public.lit_comment_likes (
  comment_id  uuid        not null references public.lit_analysis_comments(id) on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index lit_comment_likes_user_idx on public.lit_comment_likes (user_id);

alter table public.lit_analyses add column comment_count integer not null default 0;

create or replace function public.lit_sync_comment_like_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.lit_analysis_comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.lit_analysis_comments set like_count = like_count - 1 where id = old.comment_id;
  end if;
  return null;
end;
$$;

create trigger lit_comment_likes_count
  after insert or delete on public.lit_comment_likes
  for each row execute function public.lit_sync_comment_like_count();

create or replace function public.lit_sync_comment_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.lit_analyses set comment_count = comment_count + 1 where id = new.analysis_id;
  else
    update public.lit_analyses set comment_count = comment_count - 1 where id = old.analysis_id;
  end if;
  return null;
end;
$$;

create trigger lit_analysis_comments_count
  after insert or delete on public.lit_analysis_comments
  for each row execute function public.lit_sync_comment_count();

alter table public.lit_analysis_comments enable row level security;
alter table public.lit_comment_likes     enable row level security;

create policy "lit_analysis_comments: authenticated can read all"
  on public.lit_analysis_comments for select to authenticated using (true);
create policy "lit_comment_likes: authenticated can read all"
  on public.lit_comment_likes for select to authenticated using (true);

create trigger lit_analysis_comments_notify_flagged
  after update of moderation_flagged on public.lit_analysis_comments
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
where not la.moderated and not a.is_deleted

union all
select 'lit_intro_versions', iv.id
from public.lit_intro_versions iv
join public.profiles a on a.id = iv.edited_by
where not iv.moderated and not a.is_deleted

union all
select 'lit_analysis_comments', c.id
from public.lit_analysis_comments c
join public.profiles a on a.id = c.author_id
where not c.moderated and not a.is_deleted;

revoke all on public.moderation_queue from anon, authenticated;

commit;
