-- Replies to forum comments (two levels, like most comment sections).
--
--   parent_id         null  = a top-level comment on the post
--                     set   = a reply; always points at the top-level comment
--                             of the thread, even when replying to a reply
--   reply_to_user_id  whose comment was replied to ("回复 某某 的评论"); can be
--                     the replier themselves
--
-- Deleting a top-level comment deletes its replies. forum_posts.comment_count
-- keeps counting every row (comments and replies), via the existing triggers.

alter table public.forum_comments
  add column parent_id        uuid references public.forum_comments(id) on delete cascade,
  add column reply_to_user_id uuid references public.profiles(id) on delete set null;

create index forum_comments_parent_idx on public.forum_comments (parent_id, created_at)
  where parent_id is not null;
