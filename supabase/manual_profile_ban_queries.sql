-- Ban a user by email
update public.profiles
set ban_status = 'banned',
    banned_at = timezone('utc', now())
where lower(email) = lower('user@example.com');

-- Unban a user by email
update public.profiles
set ban_status = 'clear',
    banned_at = null
where lower(email) = lower('user@example.com');

-- Ban a user by id
update public.profiles
set ban_status = 'banned',
    banned_at = timezone('utc', now())
where id = '00000000-0000-0000-0000-000000000000'::uuid;

-- Unban a user by id
update public.profiles
set ban_status = 'clear',
    banned_at = null
where id = '00000000-0000-0000-0000-000000000000'::uuid;

-- Safe recipient list for patch updates and announcements
select id, email, display_name
from public.announcement_recipients
order by display_name asc;