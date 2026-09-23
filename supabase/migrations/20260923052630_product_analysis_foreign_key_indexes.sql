create index if not exists product_analysis_runs_created_by_idx
  on public.product_analysis_runs (created_by);

create index if not exists product_sales_lines_analysis_id_idx
  on public.product_sales_lines (analysis_id);
