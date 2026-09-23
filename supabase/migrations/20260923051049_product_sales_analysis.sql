create table if not exists public.product_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  source_filename text not null,
  source_document_path text,
  status text not null default 'analyzed'
    check (status in ('analyzed', 'needs_review', 'validated')),
  confidence numeric(5, 4),
  line_count integer not null default 0 check (line_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_analysis_runs_valid_period check (period_end >= period_start)
);

create table if not exists public.product_sales_lines (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.product_analysis_runs(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  raw_label text not null,
  normalized_label text not null,
  category text not null default 'Autre'
    check (category in ('Formule', 'Entrée', 'Plat', 'Dessert', 'Boisson', 'Supplément', 'Autre')),
  sale_type text not null default 'unknown'
    check (sale_type in ('formula', 'component', 'standalone', 'unknown')),
  quantity numeric(12, 3) not null default 0,
  unit_price_ttc numeric(12, 2),
  sales_ttc numeric(12, 2),
  discounts_ttc numeric(12, 2) not null default 0,
  offered_quantity numeric(12, 3) not null default 0,
  cancelled_quantity numeric(12, 3) not null default 0,
  confidence numeric(5, 4),
  created_at timestamptz not null default now(),
  constraint product_sales_lines_valid_period check (period_end >= period_start)
);

create index if not exists product_analysis_runs_establishment_period_idx
  on public.product_analysis_runs (establishment_id, period_start, period_end);
create index if not exists product_sales_lines_establishment_period_idx
  on public.product_sales_lines (establishment_id, period_start, period_end);
create index if not exists product_sales_lines_label_idx
  on public.product_sales_lines (normalized_label);

alter table public.product_analysis_runs enable row level security;
alter table public.product_sales_lines enable row level security;

revoke all on table public.product_analysis_runs from anon;
revoke all on table public.product_sales_lines from anon;
grant select, insert, update, delete on table public.product_analysis_runs to authenticated, service_role;
grant select, insert, update, delete on table public.product_sales_lines to authenticated, service_role;

drop policy if exists product_analysis_runs_select on public.product_analysis_runs;
drop policy if exists product_analysis_runs_insert on public.product_analysis_runs;
drop policy if exists product_analysis_runs_update on public.product_analysis_runs;
drop policy if exists product_analysis_runs_delete on public.product_analysis_runs;

create policy product_analysis_runs_select
on public.product_analysis_runs for select
to authenticated
using ((select public.is_management()));

create policy product_analysis_runs_insert
on public.product_analysis_runs for insert
to authenticated
with check ((select public.is_management()) and created_by = (select auth.uid()));

create policy product_analysis_runs_update
on public.product_analysis_runs for update
to authenticated
using ((select public.is_management()))
with check ((select public.is_management()));

create policy product_analysis_runs_delete
on public.product_analysis_runs for delete
to authenticated
using ((select public.is_management()));

drop policy if exists product_sales_lines_select on public.product_sales_lines;
drop policy if exists product_sales_lines_insert on public.product_sales_lines;
drop policy if exists product_sales_lines_update on public.product_sales_lines;
drop policy if exists product_sales_lines_delete on public.product_sales_lines;

create policy product_sales_lines_select
on public.product_sales_lines for select
to authenticated
using ((select public.is_management()));

create policy product_sales_lines_insert
on public.product_sales_lines for insert
to authenticated
with check ((select public.is_management()));

create policy product_sales_lines_update
on public.product_sales_lines for update
to authenticated
using ((select public.is_management()))
with check ((select public.is_management()));

create policy product_sales_lines_delete
on public.product_sales_lines for delete
to authenticated
using ((select public.is_management()));
