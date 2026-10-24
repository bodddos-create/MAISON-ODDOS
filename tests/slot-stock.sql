-- Run after the migration inside BEGIN/ROLLBACK. Never leaves test participants behind.
set local role service_role;
do $$
declare i integer; answer jsonb; row1 public.wheel_entries; row2 public.wheel_entries; won integer:=0; actual integer; n integer;
begin
 begin
  perform public.wheel_spin('parc-novembre-2026','inactive-probe','probe');
  raise exception 'Expected inactive campaign';
 exception when others then
  if sqlerrm not like '%WHEEL_INACTIVE%' then raise;end if;
 end;
 update public.wheel_campaigns set active=true,starts_at=now()-interval '1 day',ends_at=now()+interval '1 day',expires_at=now()+interval '2 days';
 for i in 1..1500 loop
  exit when won=75;
  answer:=public.wheel_spin('parc-novembre-2026','spin-'||i,'ip-'||i);
  if (answer->>'win')::boolean then
   perform public.wheel_request_ticket('parc-novembre-2026','test-'||i||'@example.com','Test',false,'','ticket-'||i,'ip-'||i,'spin-'||i);
   row1:=public.wheel_claim('parc-novembre-2026','ticket-'||i);
   row2:=public.wheel_claim('parc-novembre-2026','ticket-'||i);
   if row1.id<>row2.id then raise exception 'Duplicate draw';end if;
   if row1.prize<>answer->>'prize' then raise exception 'Result changed after email verification';end if;
   won:=won+1;
  end if;
 end loop;
 if won<>75 then raise exception 'Stock not fully tested';end if;
 select count(*) into actual from public.wheel_entries where prize='formule19';if actual<>5 then raise exception '19 quota';end if;
 select count(*) into actual from public.wheel_entries where prize='formule29';if actual<>5 then raise exception '29 quota';end if;
 select count(*) into actual from public.wheel_entries where prize='formule39';if actual<>5 then raise exception '39 quota';end if;
 select count(*) into actual from public.wheel_entries where prize='biere';if actual<>20 then raise exception 'Beer quota';end if;
 select count(*) into actual from public.wheel_entries where prize='sansalcool';if actual<>20 then raise exception 'Soft quota';end if;
 select count(*) into actual from public.wheel_entries where prize='cocktail';if actual<>20 then raise exception 'Cocktail quota';end if;
 begin
  perform public.wheel_spin('parc-novembre-2026','extra','extra');
  raise exception 'Expected no stock';
 exception when others then if sqlerrm not like '%WHEEL_SOLD_OUT%' then raise;end if;end;
 update public.wheel_entries set used_at=now() where id=row1.id and used_at is null and expires_at>now();get diagnostics n=row_count;if n<>1 then raise exception 'First redemption failed';end if;
 update public.wheel_entries set used_at=now() where id=row1.id and used_at is null and expires_at>now();get diagnostics n=row_count;if n<>0 then raise exception 'Duplicate redemption accepted';end if;
 if has_function_privilege('anon','public.wheel_spin(text,text,text)','EXECUTE') or has_table_privilege('anon','public.wheel_entries','SELECT') then raise exception 'Anonymous database access';end if;
end;$$;
reset role;
select '75 lots, quotas, idempotence, redemption and access restrictions passed' as test_result;
