create index if not exists z_imports_daily_sale_id_idx
  on public.z_imports (daily_sale_id);

create policy "z_imports_server_only"
  on public.z_imports
  for all
  to anon, authenticated
  using (false)
  with check (false);
