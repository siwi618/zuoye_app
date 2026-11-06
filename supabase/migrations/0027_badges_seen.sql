-- A red dot for new badges: on the avatar and next to 「勋章墙」 in its menu, until the user opens
-- the badge wall. profiles.badges_seen_at is when they last did; a badge granted after it (a
-- redeemed code, or a 「雷蜂」 stage reached) is new. Null = never opened, so every badge held
-- counts as new once, including the 「雷蜂」 stages credited by migration 0026.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

alter table public.profiles add column badges_seen_at timestamptz;

commit;
