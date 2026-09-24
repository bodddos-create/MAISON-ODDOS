alter table public.reservations
  add column if not exists review_email_sent_at timestamptz,
  add column if not exists review_email_claimed_at timestamptz;

create index if not exists reservations_review_email_due_idx
  on public.reservations (reservation_date)
  where review_email_sent_at is null
    and email is not null
    and status in ('confirmed', 'completed');
