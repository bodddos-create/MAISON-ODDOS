create table public.gift_vouchers (
 id uuid primary key default gen_random_uuid(),
 establishment_id uuid not null references public.establishments(id),
 code text not null unique default ('LMP-' || upper(replace(gen_random_uuid()::text,'-',''))),
 name text not null,
 label text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 used_at timestamptz,
 used_by uuid references auth.users(id),
 constraint gift_vouchers_code_format check (code ~ '^LMP-[A-F0-9]{32}$')
);
alter table public.gift_vouchers enable row level security;
revoke all on public.gift_vouchers from anon, authenticated;
grant select, insert, update on public.gift_vouchers to service_role;
create index gift_vouchers_establishment_created_idx on public.gift_vouchers(establishment_id,created_at desc);