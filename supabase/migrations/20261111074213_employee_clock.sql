create table public.clock_access(employee_id uuid primary key references public.employees(id), token_hash text unique not null, updated_at timestamptz not null default now());
create table public.clock_shifts(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id),establishment_id uuid not null references public.establishments(id),started_at timestamptz not null default now(),ended_at timestamptz, constraint valid_clock_duration check(ended_at is null or ended_at>started_at));
create unique index clock_one_open on public.clock_shifts(employee_id) where ended_at is null;
create index clock_employee_date on public.clock_shifts(employee_id,started_at);
create table public.clock_audit(id uuid primary key default gen_random_uuid(),shift_id uuid not null references public.clock_shifts(id),actor_id uuid not null,reason text not null,before_value jsonb not null,after_value jsonb not null,created_at timestamptz not null default now());
alter table public.clock_access enable row level security;
alter table public.clock_shifts enable row level security;
alter table public.clock_audit enable row level security;
revoke all on public.clock_access,public.clock_shifts,public.clock_audit from anon,authenticated;
grant all on public.clock_access,public.clock_shifts,public.clock_audit to service_role;
create function public.clock_punch(p_employee uuid,p_establishment uuid,p_action text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare s public.clock_shifts; begin
perform 1 from public.employees where id=p_employee and active=true for update;
if not found then raise exception 'INACTIVE'; end if;
perform 1 from public.establishments where id=p_establishment and active=true;
if not found then raise exception 'ESTABLISHMENT'; end if;
select * into s from public.clock_shifts where employee_id=p_employee order by started_at desc limit 1 for update;
if s.ended_at is not null and s.ended_at>now()-interval '30 seconds' then raise exception 'WAIT'; end if;
if p_action='start' then
if s.id is not null and s.ended_at is null then raise exception 'ALREADY_OPEN'; end if;
insert into public.clock_shifts(employee_id,establishment_id) values(p_employee,p_establishment) returning * into s;
elsif p_action='end' then
if s.id is null or s.ended_at is not null then raise exception 'NOT_OPEN'; end if;
if s.establishment_id<>p_establishment then raise exception 'WRONG_SITE'; end if;
if s.started_at>now()-interval '30 seconds' then raise exception 'WAIT'; end if;
update public.clock_shifts set ended_at=now() where id=s.id returning * into s;
else raise exception 'ACTION'; end if;
return to_jsonb(s); end $$;
revoke all on function public.clock_punch(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.clock_punch(uuid,uuid,text) to service_role;
create function public.clock_correct(p_id uuid,p_actor uuid,p_start timestamptz,p_end timestamptz,p_reason text) returns void language plpgsql security invoker set search_path=public as $$ declare oldrow public.clock_shifts; newrow public.clock_shifts; begin
if length(trim(p_reason))<5 or p_start>now() or p_end>now() then raise exception 'INVALID'; end if;
select * into oldrow from public.clock_shifts where id=p_id for update;
if not found then raise exception 'NOT_FOUND'; end if;
update public.clock_shifts set started_at=p_start,ended_at=p_end where id=p_id returning * into newrow;
insert into public.clock_audit(shift_id,actor_id,reason,before_value,after_value) values(p_id,p_actor,p_reason,to_jsonb(oldrow),to_jsonb(newrow)); end $$;
revoke all on function public.clock_correct(uuid,uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.clock_correct(uuid,uuid,timestamptz,timestamptz,text) to service_role;
