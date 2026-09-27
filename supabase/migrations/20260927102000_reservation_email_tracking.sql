alter table public.reservations
  add column if not exists acknowledgement_email_status text,
  add column if not exists acknowledgement_email_id text,
  add column if not exists acknowledgement_email_sent_at timestamptz,
  add column if not exists acknowledgement_email_error text,
  add column if not exists confirmation_email_status text,
  add column if not exists confirmation_email_id text,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_delivered_at timestamptz,
  add column if not exists confirmation_email_error text,
  add column if not exists confirmation_email_last_attempt_at timestamptz,
  add column if not exists confirmation_email_attempts integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_ack_email_status_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_ack_email_status_check
      check (
        acknowledgement_email_status is null
        or acknowledgement_email_status in (
          'sending', 'sent', 'delivered', 'failed',
          'bounced', 'complained', 'suppressed'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_confirmation_email_status_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_confirmation_email_status_check
      check (
        confirmation_email_status is null
        or confirmation_email_status in (
          'sending', 'sent', 'delivered', 'failed',
          'bounced', 'complained', 'suppressed'
        )
      );
  end if;
end $$;

create index if not exists reservations_confirmation_email_status_idx
  on public.reservations (confirmation_email_status)
  where confirmation_email_status is not null;
