-- Requesters can delete their own completed requests.
--
-- It's a hide, not a hard delete: the request (and its chat) disappears from
-- every list and page, but its feedback stays, so the helper keeps the rating
-- they earned on the leaderboard (public.user_ratings doesn't look at this column).
-- Set back to false in the Table Editor to restore it.

alter table public.requests
  add column deleted_by_requester boolean not null default false;

comment on column public.requests.deleted_by_requester is
  'Requester deleted this completed request: hidden everywhere, feedback still counts.';
