-- Discussion forum: posts with a tag, comments, likes on both.
--
-- Counters (view_count, like_count, comment_count) are denormalised onto the
-- rows so the list pages can sort by them cheaply. Like / comment counters are
-- kept in sync by triggers; view_count is bumped by forum_increment_view().
-- Like the rest of the schema, writes go through the backend (service role);
-- authenticated users only get SELECT.

-- =========================================================
-- forum_posts
-- =========================================================
create table public.forum_posts (
  id             uuid        primary key default gen_random_uuid(),
  author_id      uuid        not null references public.profiles(id) on delete cascade,
  title          text        not null check (char_length(title) between 1 and 120),
  body           text        not null check (char_length(body) between 1 and 5000),
  tag            text        not null,
  view_count     integer     not null default 0,
  like_count     integer     not null default 0,
  comment_count  integer     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index forum_posts_created_at_idx on public.forum_posts (created_at desc);
create index forum_posts_views_idx      on public.forum_posts (view_count desc, created_at desc);
create index forum_posts_tag_idx        on public.forum_posts (tag);

create trigger forum_posts_touch_updated_at
  before update on public.forum_posts
  for each row execute function public.touch_updated_at();

-- =========================================================
-- forum_comments
-- =========================================================
create table public.forum_comments (
  id          uuid        primary key default gen_random_uuid(),
  post_id     uuid        not null references public.forum_posts(id) on delete cascade,
  author_id   uuid        not null references public.profiles(id) on delete cascade,
  body        text        not null check (char_length(body) between 1 and 2000),
  like_count  integer     not null default 0,
  created_at  timestamptz not null default now()
);

create index forum_comments_post_idx on public.forum_comments (post_id, like_count desc, created_at);

-- =========================================================
-- likes (one per user per post / comment)
-- =========================================================
create table public.forum_post_likes (
  post_id     uuid        not null references public.forum_posts(id) on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.forum_comment_likes (
  comment_id  uuid        not null references public.forum_comments(id) on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index forum_post_likes_user_idx    on public.forum_post_likes (user_id);
create index forum_comment_likes_user_idx on public.forum_comment_likes (user_id);

-- =========================================================
-- Counter triggers
-- =========================================================
create or replace function public.forum_sync_post_like_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.forum_posts set like_count = like_count - 1 where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger forum_post_likes_count
  after insert or delete on public.forum_post_likes
  for each row execute function public.forum_sync_post_like_count();

create or replace function public.forum_sync_comment_like_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.forum_comments set like_count = like_count - 1 where id = old.comment_id;
  end if;
  return null;
end;
$$;

create trigger forum_comment_likes_count
  after insert or delete on public.forum_comment_likes
  for each row execute function public.forum_sync_comment_like_count();

create or replace function public.forum_sync_comment_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.forum_posts set comment_count = comment_count - 1 where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger forum_comments_count
  after insert or delete on public.forum_comments
  for each row execute function public.forum_sync_comment_count();

-- Atomic view bump, called by the backend when a post is opened.
create or replace function public.forum_increment_view(p_post_id uuid)
returns void
language sql
as $$
  update public.forum_posts set view_count = view_count + 1 where id = p_post_id;
$$;

revoke execute on function public.forum_increment_view(uuid) from public, anon, authenticated;

-- =========================================================
-- RLS: authenticated can read; writes via backend only
-- =========================================================
alter table public.forum_posts         enable row level security;
alter table public.forum_comments      enable row level security;
alter table public.forum_post_likes    enable row level security;
alter table public.forum_comment_likes enable row level security;

create policy "forum_posts: authenticated can read all"
  on public.forum_posts for select to authenticated using (true);

create policy "forum_comments: authenticated can read all"
  on public.forum_comments for select to authenticated using (true);

create policy "forum_post_likes: authenticated can read all"
  on public.forum_post_likes for select to authenticated using (true);

create policy "forum_comment_likes: authenticated can read all"
  on public.forum_comment_likes for select to authenticated using (true);
