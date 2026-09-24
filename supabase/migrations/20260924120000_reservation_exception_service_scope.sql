alter table public.reservation_exceptions
  add column if not exists service_scope text not null default 'all';

alter table public.reservation_exceptions
  drop constraint if exists reservation_exceptions_service_scope_check;

alter table public.reservation_exceptions
  add constraint reservation_exceptions_service_scope_check
  check (service_scope in ('all', 'midi', 'soir'));
