-- Exact future commercial total for the management dashboard.
-- The date is evaluated in the restaurants' local timezone on every call.
create index if not exists reservations_future_sales_idx
  on public.reservations (reservation_date, establishment_id)
  where status = 'confirmed' and sold_amount > 0;

create or replace function public.commercial_future_total(p_establishment_id uuid default null)
returns table(total_ttc numeric, prestations bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_management()) then
    raise exception 'Accès réservé à la direction.';
  end if;
  return query
    select coalesce(sum(r.sold_amount), 0), count(*)
    from public.reservations r
    where r.status = 'confirmed'
      and r.sold_amount > 0
      and r.reservation_date >= (now() at time zone 'Europe/Paris')::date
      and (p_establishment_id is null or r.establishment_id = p_establishment_id);
end;
$$;
revoke all on function public.commercial_future_total(uuid) from public, anon;
grant execute on function public.commercial_future_total(uuid) to authenticated;
