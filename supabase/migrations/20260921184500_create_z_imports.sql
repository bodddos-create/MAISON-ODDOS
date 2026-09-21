create table if not exists public.z_imports (
  id uuid primary key default gen_random_uuid(),
  email_id text not null,
  attachment_id text not null,
  filename text not null,
  status text not null default 'processing'
    check (status in ('processing', 'saved', 'review', 'error')),
  reason text,
  analysis jsonb,
  daily_sale_id uuid references public.daily_sales(id) on delete set null,
  document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email_id, attachment_id)
);

alter table public.z_imports enable row level security;

create index if not exists z_imports_status_created_at_idx
  on public.z_imports (status, created_at desc);
