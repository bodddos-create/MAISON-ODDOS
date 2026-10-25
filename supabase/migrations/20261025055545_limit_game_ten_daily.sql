create table public.wheel_browser_days (
 campaign text not null references public.wheel_campaigns(id),
 browser_hash text not null,
 day date not null,
 plays integer not null default 0 check(plays between 0 and 10),
 primary key(campaign,browser_hash,day)
);
alter table public.wheel_browser_days enable row level security;
revoke all on public.wheel_browser_days from public,anon,authenticated;
grant select,insert,update,delete on public.wheel_browser_days to service_role;
create function public.wheel_spin_daily(p_campaign text,p_token_hash text,p_ip_hash text,p_browser_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare local_day date := (now() at time zone 'Europe/Paris')::date; n integer; result jsonb;
begin
 if p_browser_hash is null or p_browser_hash !~ '^[a-f0-9]{64}$' then raise exception 'WHEEL_BROWSER_INVALID'; end if;
 insert into public.wheel_browser_days(campaign,browser_hash,day) values(p_campaign,p_browser_hash,local_day)
 on conflict(campaign,browser_hash,day) do nothing;
 select plays into n from public.wheel_browser_days where campaign=p_campaign and browser_hash=p_browser_hash and day=local_day for update;
 if n>=10 then raise exception 'WHEEL_DAILY_LIMIT'; end if;
 result := public.wheel_spin(p_campaign,p_token_hash,p_ip_hash);
 update public.wheel_browser_days set plays=plays+1 where campaign=p_campaign and browser_hash=p_browser_hash and day=local_day;
 return result || jsonb_build_object('playsLeft',9-n);
end;$$;
revoke all on function public.wheel_spin_daily(text,text,text,text) from public,anon,authenticated;
grant execute on function public.wheel_spin_daily(text,text,text,text) to service_role;

create or replace function public.wheel_cleanup()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare tickets_removed integer; spins_removed integer; anonymized integer:=0;
begin
 delete from public.wheel_browser_days where day < (now() at time zone 'Europe/Paris')::date - 30;
 delete from public.wheel_tickets where expires_at<now()-interval '1 day';
 get diagnostics tickets_removed=row_count;
 delete from public.wheel_spins s where expires_at<now()-interval '1 day' and not exists(select 1 from public.wheel_tickets t where t.spin_id=s.id);
 get diagnostics spins_removed=row_count;
 if now()>='2027-02-28 00:00 Europe/Paris'::timestamptz then
  update public.wheel_entries set email='anonymized-'||id||'@invalid.local',name='Anonymisé',used_by=null,email_id=null
  where campaign='parc-novembre-2026' and not consent and name<>'Anonymisé';
  get diagnostics anonymized=row_count;
 end if;
 return jsonb_build_object('tickets_removed',tickets_removed,'spins_removed',spins_removed,'anonymized',anonymized);
end;$$;
revoke all on function public.wheel_cleanup() from public,anon,authenticated;
grant execute on function public.wheel_cleanup() to service_role;
