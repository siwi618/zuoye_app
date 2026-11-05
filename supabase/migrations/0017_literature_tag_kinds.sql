-- Literature tool: tags of different kinds. Besides #devices (shared by every work; the sphere's
-- core), students tag @characters, which belong to one work. Existing tags are devices.
-- More kinds (themes, settings…) can be added to the check below later.
--
-- Wrapped in one transaction: if any statement fails, nothing is changed.

begin;

alter table public.lit_tags
  add column kind     text not null default 'device' check (kind in ('device', 'character')),
  add column work_key text check (work_key ~ '^[a-z0-9-]{1,40}$');

-- A character belongs to a work; a device to none.
alter table public.lit_tags
  add constraint lit_tags_scope_check check ((kind = 'device') = (work_key is null));

-- Names are unique ignoring case: devices across the site, characters within their work.
drop index public.lit_tags_name_idx;
create unique index lit_tags_device_name_idx on public.lit_tags (lower(name))
  where kind = 'device';
create unique index lit_tags_character_name_idx on public.lit_tags (work_key, lower(name))
  where kind = 'character';

-- "@" now marks a character reference too, so names can't contain it either.
alter table public.lit_tags drop constraint if exists lit_tags_name_check;
alter table public.lit_tags
  add constraint lit_tags_name_check
  check (char_length(name) between 1 and 20 and name !~ '[#@()（）\s]');

commit;
