alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('direction', 'administratif', 'restaurant', 'reservation_staff'));

create or replace function public.can_access_establishment(eid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    private.current_role() in ('direction', 'administratif')
    or (
      private.current_role() = 'restaurant'
      and private.current_establishment_id() = eid
    ),
    false
  )
$$;

create or replace function public.can_manage_reservations(eid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    private.current_role() in ('direction', 'administratif')
    or (
      private.current_role() in ('restaurant', 'reservation_staff')
      and private.current_establishment_id() = eid
    ),
    false
  )
$$;

revoke all on function public.can_manage_reservations(uuid) from public;
grant execute on function public.can_manage_reservations(uuid) to authenticated, service_role;

drop policy if exists reservations_access on public.reservations;
drop policy if exists reservations_select on public.reservations;
drop policy if exists reservations_insert on public.reservations;
drop policy if exists reservations_update on public.reservations;
drop policy if exists reservations_delete on public.reservations;

create policy reservations_select
on public.reservations for select
to authenticated
using ((select public.can_manage_reservations(establishment_id)));

create policy reservations_insert
on public.reservations for insert
to authenticated
with check ((select public.can_manage_reservations(establishment_id)));

create policy reservations_update
on public.reservations for update
to authenticated
using ((select public.can_manage_reservations(establishment_id)))
with check ((select public.can_manage_reservations(establishment_id)));

create policy reservations_delete
on public.reservations for delete
to authenticated
using ((select public.is_management()));

drop policy if exists reservation_services_access on public.reservation_services;
drop policy if exists reservation_services_select on public.reservation_services;
drop policy if exists reservation_services_insert on public.reservation_services;
drop policy if exists reservation_services_update on public.reservation_services;
drop policy if exists reservation_services_delete on public.reservation_services;

create policy reservation_services_select
on public.reservation_services for select
to authenticated
using ((select public.can_manage_reservations(establishment_id)));

create policy reservation_services_insert
on public.reservation_services for insert
to authenticated
with check ((select public.is_management()));

create policy reservation_services_update
on public.reservation_services for update
to authenticated
using ((select public.is_management()))
with check ((select public.is_management()));

create policy reservation_services_delete
on public.reservation_services for delete
to authenticated
using ((select public.is_management()));

drop policy if exists reservation_settings_management on public.reservation_settings;
drop policy if exists reservation_settings_select on public.reservation_settings;
drop policy if exists reservation_settings_insert on public.reservation_settings;
drop policy if exists reservation_settings_update on public.reservation_settings;
drop policy if exists reservation_settings_delete on public.reservation_settings;

create policy reservation_settings_select
on public.reservation_settings for select
to authenticated
using ((select public.can_manage_reservations(establishment_id)));

create policy reservation_settings_insert
on public.reservation_settings for insert
to authenticated
with check ((select public.is_management()));

create policy reservation_settings_update
on public.reservation_settings for update
to authenticated
using ((select public.is_management()))
with check ((select public.is_management()));

create policy reservation_settings_delete
on public.reservation_settings for delete
to authenticated
using ((select public.is_management()));

drop policy if exists reservation_exceptions_management on public.reservation_exceptions;
drop policy if exists reservation_exceptions_select on public.reservation_exceptions;
drop policy if exists reservation_exceptions_insert on public.reservation_exceptions;
drop policy if exists reservation_exceptions_update on public.reservation_exceptions;
drop policy if exists reservation_exceptions_delete on public.reservation_exceptions;

create policy reservation_exceptions_select
on public.reservation_exceptions for select
to authenticated
using ((select public.can_manage_reservations(establishment_id)));

create policy reservation_exceptions_insert
on public.reservation_exceptions for insert
to authenticated
with check ((select public.is_management()));

create policy reservation_exceptions_update
on public.reservation_exceptions for update
to authenticated
using ((select public.is_management()))
with check ((select public.is_management()));

create policy reservation_exceptions_delete
on public.reservation_exceptions for delete
to authenticated
using ((select public.is_management()));

drop policy if exists opening_days_select on public.opening_days;
drop policy if exists opening_days_insert on public.opening_days;
drop policy if exists opening_days_update on public.opening_days;
drop policy if exists opening_days_delete on public.opening_days;

create policy opening_days_select
on public.opening_days for select
to authenticated
using ((select public.is_management()));

create policy opening_days_insert
on public.opening_days for insert
to authenticated
with check (
  (select public.is_management())
  and created_by = (select auth.uid())
);

create policy opening_days_update
on public.opening_days for update
to authenticated
using ((select public.is_management()))
with check ((select public.is_management()));

create policy opening_days_delete
on public.opening_days for delete
to authenticated
using ((select public.is_management()));
