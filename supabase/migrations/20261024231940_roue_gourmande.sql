create table public.wheel_campaigns (
 id text primary key, establishment_id uuid not null references public.establishments(id),
 starts_at timestamptz not null, ends_at timestamptz not null, expires_at timestamptz not null,
 active boolean not null default false,
 check(starts_at < ends_at and ends_at < expires_at)
);
create table public.wheel_prizes (
 campaign text not null references public.wheel_campaigns(id), slot integer not null check(slot>=0 and slot<75),
 prize text not null, primary key(campaign,slot)
);
create table public.wheel_spins (
 id uuid primary key default gen_random_uuid(), campaign text not null references public.wheel_campaigns(id),
 token_hash text not null unique, ip_hash text not null, slot integer,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '15 minutes',
 claimed_at timestamptz, foreign key(campaign,slot) references public.wheel_prizes(campaign,slot)
);
create index wheel_spins_ip on public.wheel_spins(campaign,ip_hash,created_at);
create index wheel_spins_holds on public.wheel_spins(campaign,slot,expires_at) where claimed_at is null;
create table public.wheel_tickets (
 id uuid primary key default gen_random_uuid(), campaign text not null references public.wheel_campaigns(id),
 spin_id uuid not null references public.wheel_spins(id), token_hash text not null unique, email text not null, name text not null, consent boolean not null,
 consent_text text not null, ip_hash text not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '15 minutes'
);
create index wheel_tickets_email on public.wheel_tickets(campaign,email,created_at);
create index wheel_tickets_ip on public.wheel_tickets(campaign,ip_hash,created_at);
create table public.wheel_entries (
 id uuid primary key default gen_random_uuid(), campaign text not null references public.wheel_campaigns(id),
 slot integer not null, prize text not null, email text not null, name text not null,
 consent boolean not null, consent_text text not null,
 code text not null unique default 'LMP-'||upper(replace(gen_random_uuid()::text,'-','')),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 used_at timestamptz, used_by uuid references auth.users(id),
 email_id text, email_status text not null default 'pending' check(email_status in ('pending','sent','failed')),
 unique(campaign,email), unique(campaign,slot), foreign key(campaign,slot) references public.wheel_prizes(campaign,slot)
);
alter table public.wheel_spins enable row level security;
alter table public.wheel_campaigns enable row level security;
alter table public.wheel_prizes enable row level security;
alter table public.wheel_tickets enable row level security;
alter table public.wheel_entries enable row level security;
revoke all on public.wheel_campaigns,public.wheel_prizes,public.wheel_spins,public.wheel_tickets,public.wheel_entries from anon,authenticated;
grant select,insert,update,delete on public.wheel_campaigns,public.wheel_prizes,public.wheel_spins,public.wheel_tickets,public.wheel_entries to service_role;
insert into public.wheel_campaigns values ('parc-novembre-2026','55c6e880-aa0c-40d6-9065-b5315b1a602a','2026-10-27 00:00 Europe/Paris','2026-11-27 23:59:59.999 Europe/Paris','2026-11-30 23:59:59.999 Europe/Paris',false);
insert into public.wheel_prizes(campaign,slot,prize)
select 'parc-novembre-2026',i,case when i<5 then 'formule19' when i<10 then 'formule29' when i<15 then 'formule39' when i<35 then 'biere' when i<55 then 'sansalcool' else 'cocktail' end from generate_series(0,74) i;
create function public.wheel_spin(p_campaign text,p_token_hash text,p_ip_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.wheel_campaigns; p public.wheel_prizes; s public.wheel_spins; win boolean;
begin
 select * into c from public.wheel_campaigns where id=p_campaign for update;
 if not found or not c.active then raise exception 'WHEEL_INACTIVE';end if;
 if now()<c.starts_at or now()>c.ends_at then raise exception 'WHEEL_NOT_OPEN';end if;
 if (select count(*) from public.wheel_spins where campaign=p_campaign and ip_hash=p_ip_hash and created_at>now()-interval '1 minute')>=30 then raise exception 'WHEEL_RATE_LIMIT';end if;
 if (select count(*) from public.wheel_entries where campaign=p_campaign)>=75 then raise exception 'WHEEL_SOLD_OUT';end if;
 win:=random()<0.2;
 if win then
  select * into p from public.wheel_prizes w where w.campaign=p_campaign
  and not exists(select 1 from public.wheel_entries e where e.campaign=w.campaign and e.slot=w.slot)
  and not exists(select 1 from public.wheel_spins held where held.campaign=w.campaign and held.slot=w.slot and held.claimed_at is null and held.expires_at>now())
  order by random() limit 1;
  if not found then win:=false;end if;
 end if;
 insert into public.wheel_spins(campaign,token_hash,ip_hash,slot) values(p_campaign,p_token_hash,p_ip_hash,case when win then p.slot else null end) returning * into s;
 return jsonb_build_object('win',win,'prize',case when win then p.prize else null end,'expiresAt',s.expires_at);
end;$$;
create function public.wheel_request_ticket(p_campaign text,p_email text,p_name text,p_consent boolean,p_consent_text text,p_token_hash text,p_ip_hash text,p_win_hash text)
returns public.wheel_tickets language plpgsql security invoker set search_path='' as $$
declare c public.wheel_campaigns; t public.wheel_tickets; s public.wheel_spins;
begin
 select * into c from public.wheel_campaigns where id=p_campaign for update;
 if not found or not c.active then raise exception 'WHEEL_INACTIVE';end if;
 select * into s from public.wheel_spins where campaign=p_campaign and token_hash=p_win_hash and slot is not null and claimed_at is null and expires_at>now();
 if not found then raise exception 'WHEEL_TICKET_INVALID';end if;
 if (select count(*) from public.wheel_tickets where campaign=p_campaign and email=p_email and created_at>now()-interval '15 minutes')>=3
 or (select count(*) from public.wheel_tickets where campaign=p_campaign and ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=10 then raise exception 'WHEEL_RATE_LIMIT';end if;
 insert into public.wheel_tickets(campaign,spin_id,email,name,consent,consent_text,token_hash,ip_hash,expires_at) values(p_campaign,s.id,p_email,p_name,p_consent,p_consent_text,p_token_hash,p_ip_hash,s.expires_at) returning * into t;
 return t;
end;$$;
create function public.wheel_claim(p_campaign text,p_token_hash text)
returns public.wheel_entries language plpgsql security invoker set search_path='' as $$
declare c public.wheel_campaigns; t public.wheel_tickets; e public.wheel_entries; s public.wheel_spins; p public.wheel_prizes;
begin
 select * into c from public.wheel_campaigns where id=p_campaign for update;
 if not found or not c.active then raise exception 'WHEEL_INACTIVE';end if;
 select * into t from public.wheel_tickets where campaign=p_campaign and token_hash=p_token_hash and expires_at>now();
 if not found then raise exception 'WHEEL_TICKET_INVALID';end if;
 select * into e from public.wheel_entries where campaign=p_campaign and email=t.email;
 if found then
  update public.wheel_spins set expires_at=least(expires_at,now()) where id=t.spin_id and claimed_at is null;
  return e;
 end if;
 select * into s from public.wheel_spins where id=t.spin_id and slot is not null and claimed_at is null and expires_at>now();
 if not found then raise exception 'WHEEL_TICKET_INVALID';end if;
 select * into p from public.wheel_prizes where campaign=p_campaign and slot=s.slot;
 insert into public.wheel_entries(campaign,slot,prize,email,name,consent,consent_text,expires_at) values(p_campaign,p.slot,p.prize,t.email,t.name,t.consent,t.consent_text,c.expires_at) returning * into e;
 update public.wheel_spins set claimed_at=now() where id=s.id;
 return e;
end;$$;
revoke all on function public.wheel_spin(text,text,text),public.wheel_request_ticket(text,text,text,boolean,text,text,text,text),public.wheel_claim(text,text) from public,anon,authenticated;
grant execute on function public.wheel_spin(text,text,text),public.wheel_request_ticket(text,text,text,boolean,text,text,text,text),public.wheel_claim(text,text) to service_role;

-- Maintenance is called by the existing authenticated daily job.
create function public.wheel_cleanup()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare tickets_removed integer; spins_removed integer; anonymized integer:=0;
begin
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
