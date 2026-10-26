create table public.website_daily_metrics (
 site text not null check(site in ('villa','parc')),
 day date not null,
 pageviews bigint not null default 0,
 visits bigint not null default 0,
 primary key(site,day)
);
create table public.website_visit_sessions (
 site text not null check(site in ('villa','parc')),
 day date not null,
 session_id uuid not null,
 event_ids uuid[] not null,
 primary key(site,day,session_id)
);
alter table public.website_daily_metrics enable row level security;
alter table public.website_visit_sessions enable row level security;
revoke all on public.website_daily_metrics,public.website_visit_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.website_daily_metrics,public.website_visit_sessions to service_role;
create function public.record_website_visit(p_site text,p_session uuid,p_event uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare d date := (now() at time zone 'Europe/Paris')::date; n integer;
begin
 if p_site not in ('villa','parc') or p_session is null or p_event is null then raise exception 'Invalid event'; end if;
 insert into public.website_visit_sessions(site,day,session_id,event_ids) values(p_site,d,p_session,array[p_event])
 on conflict(site,day,session_id) do update set event_ids=public.website_visit_sessions.event_ids || p_event
 where not(p_event=any(public.website_visit_sessions.event_ids)) and cardinality(public.website_visit_sessions.event_ids)<200
 returning cardinality(event_ids) into n;
 if n is not null then
 insert into public.website_daily_metrics(site,day,pageviews,visits) values(p_site,d,1,case when n=1 then 1 else 0 end)
 on conflict(site,day) do update set pageviews=public.website_daily_metrics.pageviews+1,visits=public.website_daily_metrics.visits+case when n=1 then 1 else 0 end;
 end if;
 delete from public.website_visit_sessions where day<d-31;
 delete from public.website_daily_metrics where day<d-400;
end $$;
revoke all on function public.record_website_visit(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_website_visit(text,uuid,uuid) to service_role;
