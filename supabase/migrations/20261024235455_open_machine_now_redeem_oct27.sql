-- Open participation now; voucher redemption remains blocked by the server until
-- 27 October 2026, 00:00 Europe/Paris (redeemStartsAt in roue-config).
update public.wheel_campaigns
set starts_at = '2026-10-25 00:00 Europe/Paris'::timestamptz
where id = 'parc-novembre-2026';
