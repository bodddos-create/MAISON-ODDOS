-- Keep commercial reservations visible in the reservation list and link each
-- privatization to the service it blocks. Existing rows remain standard.
alter table public.reservations
  add column if not exists reservation_type text not null default 'standard';
alter table public.reservations
  drop constraint if exists reservations_reservation_type_check;
alter table public.reservations
  add constraint reservations_reservation_type_check
  check (reservation_type in ('standard', 'privatisation'));

alter table public.reservations
  drop constraint if exists reservations_party_size_check;
alter table public.reservations
  add constraint reservations_party_size_check check (party_size between 1 and 300);

drop policy if exists reservations_commercial_type_insert on public.reservations;
create policy reservations_commercial_type_insert
on public.reservations as restrictive for insert to authenticated
with check (reservation_type = 'standard' or (select public.is_management()));

alter table public.reservation_exceptions
  add column if not exists reservation_id uuid unique references public.reservations(id) on delete cascade;
alter table public.reservation_exceptions
  drop constraint if exists reservation_exceptions_establishment_id_exception_date_key;
alter table public.reservation_exceptions
  drop constraint if exists reservation_exceptions_date_scope_key;
alter table public.reservation_exceptions
  add constraint reservation_exceptions_date_scope_key
  unique (establishment_id, exception_date, service_scope);

create or replace function public.create_commercial_reservation(
  p_establishment_id uuid,
  p_reservation_date date,
  p_service_scope text,
  p_reservation_time time,
  p_party_size integer,
  p_customer_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null,
  p_reservation_type text default 'standard',
  p_status text default 'confirmed',
  p_accept_existing boolean default false
)
returns public.reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booked public.reservations;
  existing_count integer;
begin
  if not (select public.is_management()) then
    raise exception 'Accès réservé à la direction.';
  end if;
  if not exists (select 1 from public.establishments where id = p_establishment_id and active) then
    raise exception 'Restaurant introuvable.';
  end if;
  if p_reservation_date is null or p_reservation_date < (now() at time zone 'Europe/Paris')::date then
    raise exception 'Choisissez une date à venir.';
  end if;
  if p_service_scope not in ('midi', 'soir') or p_reservation_time is null or
     (p_service_scope = 'midi' and p_reservation_time >= time '17:00') or
     (p_service_scope = 'soir' and p_reservation_time < time '17:00') then
    raise exception 'Choisissez une heure correspondant au service.';
  end if;
  if p_party_size not between 1 and 300 or
     length(btrim(coalesce(p_customer_name, ''))) not between 2 and 120 or
     length(btrim(coalesce(p_phone, ''))) not between 8 and 30 or
     length(coalesce(p_email, '')) > 160 or length(coalesce(p_notes, '')) > 2000 or
     p_reservation_type not in ('standard', 'privatisation') or
     p_status not in ('pending', 'confirmed') then
    raise exception 'Vérifiez les informations de la réservation.';
  end if;

  if p_reservation_type = 'privatisation' then
    -- Serialise competing requests for the same restaurant/date.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_establishment_id::text || p_reservation_date::text, 0));
    if exists (
      select 1 from public.reservation_exceptions
      where establishment_id = p_establishment_id and exception_date = p_reservation_date
        and is_closed and service_scope in ('all', p_service_scope)
    ) then
      raise exception 'Ce service est déjà bloqué. Vérifiez les fermetures exceptionnelles.';
    end if;
    select count(*) into existing_count from public.reservations
    where establishment_id = p_establishment_id and reservation_date = p_reservation_date
      and status in ('pending', 'confirmed')
      and ((p_service_scope = 'midi' and reservation_time < time '17:00') or
           (p_service_scope = 'soir' and reservation_time >= time '17:00'));
    if existing_count > 0 and not p_accept_existing then
      raise exception 'Ce service contient déjà % réservation(s). Confirmez après les avoir vérifiées.', existing_count;
    end if;
  end if;

  insert into public.reservations (
    establishment_id, reservation_date, reservation_time, party_size,
    customer_name, phone, email, notes, status, source,
    confirmation_code, reservation_type
  ) values (
    p_establishment_id, p_reservation_date, p_reservation_time, p_party_size,
    btrim(p_customer_name), btrim(p_phone), nullif(btrim(p_email), ''),
    nullif(btrim(p_notes), ''), p_status, 'phone',
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), p_reservation_type
  ) returning * into booked;

  if p_reservation_type = 'privatisation' then
    insert into public.reservation_exceptions (
      establishment_id, exception_date, service_scope, is_closed, note, reservation_id
    ) values (
      p_establishment_id, p_reservation_date, p_service_scope, true, 'Privatisation', booked.id
    );
  end if;
  return booked;
end;
$$;
revoke all on function public.create_commercial_reservation(
  uuid, date, text, time, integer, text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.create_commercial_reservation(
  uuid, date, text, time, integer, text, text, text, text, text, text, boolean
) to authenticated;

create or replace function public.release_cancelled_privatization()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.reservation_type is distinct from new.reservation_type then
    raise exception 'Le type de réservation ne peut pas être modifié.';
  end if;
  if old.reservation_type = 'privatisation' and old.status is distinct from new.status
     and not (select public.is_management()) then
    raise exception 'La direction doit gérer cette privatisation.';
  end if;
  if old.reservation_type = 'privatisation' and old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Créez une nouvelle privatisation après une annulation.';
  end if;
  if old.reservation_type = 'privatisation' and new.status = 'cancelled' and old.status <> 'cancelled' then
    delete from public.reservation_exceptions where reservation_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists reservation_cancelled_privatization on public.reservations;
create trigger reservation_cancelled_privatization
  after update of status on public.reservations
  for each row execute function public.release_cancelled_privatization();
