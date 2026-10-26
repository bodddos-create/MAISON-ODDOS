-- Aggregate page loads only. No per-visitor rows, identifiers or cross-site linking.
create table public.website_daily_page_counts (
 site text not null check(site in ('villa','parc')),
 day date not null,
 pageviews bigint not null default 0 check(pageviews>=0),
 primary key(site,day)
);
alter table public.website_daily_page_counts enable row level security;
revoke all on public.website_daily_page_counts from public,anon,authenticated;
grant select,insert,update,delete on public.website_daily_page_counts to service_role;
create function public.record_website_page_count(p_site text) returns void
language plpgsql security invoker set search_path = '' as $$
declare d date := (now() at time zone 'Europe/Paris')::date;
begin
 if p_site is null or p_site not in ('villa','parc') then raise exception 'Invalid site'; end if;
 insert into public.website_daily_page_counts(site,day,pageviews) values(p_site,d,1)
 on conflict(site,day) do update set pageviews=public.website_daily_page_counts.pageviews+1;
 delete from public.website_daily_page_counts where day<d-400;
end $$;
revoke all on function public.record_website_page_count(text) from public,anon,authenticated;
grant execute on function public.record_website_page_count(text) to service_role;
