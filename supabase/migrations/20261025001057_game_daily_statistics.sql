-- Aggregate only counts: no IP address, token, name or email is retained here.
lock table public.wheel_spins in share row exclusive mode;
create table public.wheel_daily_stats (
 campaign text not null references public.wheel_campaigns(id),
 day date not null,
 plays bigint not null default 0 check (plays >= 0),
 wins bigint not null default 0 check (wins >= 0 and wins <= plays),
 primary key(campaign, day)
);
alter table public.wheel_daily_stats enable row level security;
revoke all on public.wheel_daily_stats from public,anon,authenticated;
grant select,insert,update on public.wheel_daily_stats to service_role;
insert into public.wheel_daily_stats(campaign,day,plays,wins)
 select campaign,(created_at at time zone 'Europe/Paris')::date,count(*),count(slot)
 from public.wheel_spins group by campaign,(created_at at time zone 'Europe/Paris')::date;
create function public.wheel_count_play() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 insert into public.wheel_daily_stats as d(campaign,day,plays,wins)
 values(new.campaign,(new.created_at at time zone 'Europe/Paris')::date,1,case when new.slot is null then 0 else 1 end)
 on conflict(campaign,day) do update set plays=d.plays+1,wins=d.wins+excluded.wins;
 return new;
end;$$;
revoke all on function public.wheel_count_play() from public,anon,authenticated;
grant execute on function public.wheel_count_play() to service_role;
create trigger wheel_count_play after insert on public.wheel_spins
 for each row execute function public.wheel_count_play();
