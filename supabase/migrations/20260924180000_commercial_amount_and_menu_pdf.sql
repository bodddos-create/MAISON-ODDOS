-- Commercial amounts stay on their reservation; the projection is calculated
-- from future confirmed reservations, so historical records are preserved.
alter table public.reservations
  add column if not exists sold_amount numeric(12,2),
  add column if not exists menu_label text,
  add column if not exists menu_pdf_path text;
alter table public.reservations
  drop constraint if exists reservations_sold_amount_check;
alter table public.reservations
  add constraint reservations_sold_amount_check
  check (sold_amount is null or sold_amount >= 0);
alter table public.reservations
  drop constraint if exists reservations_menu_label_check;
alter table public.reservations
  add constraint reservations_menu_label_check
  check (menu_label is null or length(menu_label) <= 160);

-- Reservation staff may work on ordinary bookings but cannot attach or alter
-- commercial sale details through the Data API.
drop policy if exists reservations_sale_fields_insert on public.reservations;
create policy reservations_sale_fields_insert on public.reservations
  as restrictive for insert to authenticated
  with check (
    (sold_amount is null and menu_label is null and menu_pdf_path is null)
    or (select public.is_management())
  );

create or replace function public.protect_reservation_sale_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (old.sold_amount is distinct from new.sold_amount
      or old.menu_label is distinct from new.menu_label
      or old.menu_pdf_path is distinct from new.menu_pdf_path)
     and not (select public.is_management()) then
    raise exception 'La direction doit gérer les prestations vendues.';
  end if;
  return new;
end;
$$;
drop trigger if exists reservation_sale_fields_management on public.reservations;
create trigger reservation_sale_fields_management
  before update of sold_amount, menu_label, menu_pdf_path on public.reservations
  for each row execute function public.protect_reservation_sale_fields();

-- The existing function remains available while the new application is rolled out.
-- Wrapping it keeps booking, privatization, and sale amount in one transaction.
drop function if exists public.create_commercial_sale(
  uuid, date, text, time, integer, text, text, text, text, text, text, boolean, numeric
);
create or replace function public.create_commercial_sale(
  p_establishment_id uuid,
  p_reservation_date date,
  p_service_scope text,
  p_reservation_time time,
  p_party_size integer,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_notes text,
  p_reservation_type text,
  p_status text,
  p_accept_existing boolean,
  p_sold_amount numeric,
  p_menu_label text
)
returns public.reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booked public.reservations;
begin
  if p_sold_amount is not null and (p_sold_amount < 0 or p_sold_amount > 9999999999.99) then
    raise exception 'Montant de prestation invalide.';
  end if;
  if length(coalesce(p_menu_label, '')) > 160 then
    raise exception 'Le nom du menu est trop long.';
  end if;
  booked := public.create_commercial_reservation(
    p_establishment_id, p_reservation_date, p_service_scope,
    p_reservation_time, p_party_size, p_customer_name, p_phone,
    p_email, p_notes, p_reservation_type, p_status, p_accept_existing
  );
  update public.reservations set sold_amount = p_sold_amount,
    menu_label = nullif(btrim(p_menu_label), ''), updated_at = now()
  where id = booked.id returning * into booked;
  return booked;
end;
$$;
revoke all on function public.create_commercial_sale(
  uuid, date, text, time, integer, text, text, text, text, text, text, boolean, numeric, text
) from public, anon;
grant execute on function public.create_commercial_sale(
  uuid, date, text, time, integer, text, text, text, text, text, text, boolean, numeric, text
) to authenticated;
