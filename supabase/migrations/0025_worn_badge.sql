-- Wearing a badge: a user picks one of their badges on the badge wall, and it shows after their
-- name wherever the site shows it (requests, forum, literature, feedback, leaderboard).
--
-- profiles.worn_badge is one badge key or null. The foreign key (id, worn_badge) points at the
-- user's own row in user_badges, so only a badge the user holds can be worn, and taking a badge
-- back (deleting that row) clears worn_badge by itself: `on delete set null (worn_badge)` nulls
-- just that column (Postgres 15+), not id.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

alter table public.profiles add column worn_badge text;

alter table public.profiles
  add constraint profiles_worn_badge_fkey
  foreign key (id, worn_badge) references public.user_badges (user_id, badge)
  on delete set null (worn_badge);

commit;
