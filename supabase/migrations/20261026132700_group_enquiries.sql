-- Server-only enquiries. All browser access goes through the authenticated API.
create table public.group_enquiries (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 created_at timestamptz not null default now(), establishment_id uuid not null references public.establishments(id),
 restaurant text not null check (restaurant in ('villa','parc')), event_date date not null,
 start_time time not null, end_time time, flexibility text not null, guests integer not null check (guests between 1 and 1000),
 occasion text not null, full_name text not null, company text not null default '', email text not null, phone text not null,
 budget text not null default '', message text not null default '', privacy_accepted_at timestamptz not null,
 status text not null default 'new' check(status in ('new','contacted','quoted','confirmed','closed')),
 notification_status text not null default 'pending' check(notification_status in ('pending','sent','failed')), notification_id text
);
alter table public.group_enquiries enable row level security;
revoke all on public.group_enquiries from anon, authenticated;
grant select,insert,update on public.group_enquiries to service_role;
create index group_enquiries_received_idx on public.group_enquiries(created_at desc);
create index group_enquiries_email_recent_idx on public.group_enquiries(email,created_at desc);
