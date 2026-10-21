-- 1) The "University" grade option is now "Teacher".
update public.profiles set grade = 'Teacher' where grade = 'University';
update public.requests set grade = 'Teacher' where grade = 'University';

-- 2) Display names can be changed once every 30 days, through the backend
--    (PUT /me/name), which checks the limit and moderates the new name.
alter table public.profiles add column display_name_changed_at timestamptz;

comment on column public.profiles.display_name_changed_at is
  'Last time the user renamed themselves; the next rename is allowed 30 days later.';

-- Clients may still update their own profile row directly (RLS "user can
-- update own"), which would skip the 30-day limit. Block renames that don't
-- come from the backend's service role.
create or replace function public.guard_profile_display_name()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.display_name is distinct from old.display_name
          or new.display_name_changed_at is distinct from old.display_name_changed_at) then
    raise exception 'Change your display name from the profile page';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_display_name
  before update on public.profiles
  for each row execute function public.guard_profile_display_name();
