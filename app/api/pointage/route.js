import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import {config,requestDb,hash,sameOrigin} from '../../../lib/roue-server';
export const dynamic='force-dynamic';
const uuid=/^[a-f0-9-]{36}$/i;
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function identity(req,c){
 const auth=req.headers.get('authorization')||'';
 if(auth.startsWith('Bearer ')){
 const r=await fetch(`${c.url}/auth/v1/user`,{headers:{apikey:c.key,Authorization:auth},cache:'no-store'});
 if(r.ok){const u=await r.json();const p=await requestDb(c,`profiles?user_id=eq.${u.id}&select=role`);if(['direction','administratif'].includes(p?.[0]?.role))return {manager:true,id:u.id};}
 }
 const token=req.headers.get('x-clock-token')||'';
 if(!/^[a-f0-9]{48}$/.test(token))return null;
 const a=await requestDb(c,`clock_access?token_hash=eq.${hash(token)}&select=employee_id`);
 if(!a?.[0])return null;
 const e=await requestDb(c,`employees?id=eq.${a[0].employee_id}&active=eq.true&select=id,full_name`);
 return e?.[0]?{employee:e[0]}:null;
}
export async function GET(req){try{
 const c=config(),u=await identity(req,c);if(!u)return json({error:'Accès invalide ou désactivé.'},401);
 const params=new URL(req.url).searchParams;
 const month=params.get('month')||new Date().toISOString().slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return json({error:'Mois invalide.'},400);
 const end=new Date(`${month}-01T00:00:00Z`);end.setUTCMonth(end.getUTCMonth()+1);
 const start=new Date(`${month}-01T00:00:00Z`);start.setUTCDate(start.getUTCDate()-1);
 const filter=u.manager?'':`&employee_id=eq.${u.employee.id}`;
 const [shifts,open,establishments,audit,recent]=await Promise.all([
 requestDb(c,`clock_shifts?started_at=gte.${start.toISOString()}&started_at=lt.${end.toISOString()}${filter}&order=started_at.desc&limit=10000`),
 requestDb(c,`clock_shifts?ended_at=is.null${filter}&order=started_at.desc`),
 requestDb(c,'establishments?active=eq.true&select=id,name'),
 u.manager?requestDb(c,'clock_audit?select=*&order=created_at.desc&limit=100'):Promise.resolve([]),
 requestDb(c,`clock_shifts?started_at=gte.${new Date(Date.now()-8*86400000).toISOString()}${filter}&order=started_at.desc&limit=10000`)]);
 return json({employee:u.employee,shifts,open,establishments,audit,recent});
 }catch{return json({error:'Impossible de charger la pointeuse.'},503)}}
export async function POST(req){try{
 if(!sameOrigin(req))return json({error:'Origine refusée.'},403);
 const c=config(),u=await identity(req,c);if(!u)return json({error:'Accès invalide ou désactivé.'},401);
 const b=await req.json();
 if(u.manager && ['access','revoke'].includes(b.action)){
 if(!uuid.test(b.employee_id))return json({error:'Salarié invalide.'},400);
 const e=await requestDb(c,`employees?id=eq.${b.employee_id}&active=eq.true&select=id`);if(!e?.[0])return json({error:'Salarié inactif ou introuvable.'},400);
 if(b.action==='revoke'){await requestDb(c,`clock_access?employee_id=eq.${b.employee_id}`,{method:'DELETE'});return json({ok:true});}
 const token=crypto.randomBytes(24).toString('hex');
 await requestDb(c,'clock_access?on_conflict=employee_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({employee_id:b.employee_id,token_hash:hash(token),updated_at:new Date().toISOString()})});return json({token});
 }
 if(u.manager && b.action==='correct'){
 if(!uuid.test(b.id)||!b.start||!Number.isFinite(Date.parse(b.start))||(b.end&&!Number.isFinite(Date.parse(b.end)))||String(b.reason||'').trim().length<5)return json({error:'Vérifiez les heures et indiquez un motif (5 caractères minimum).'},400);
 await requestDb(c,'rpc/clock_correct',{method:'POST',body:JSON.stringify({p_id:b.id,p_actor:u.id,p_start:b.start,p_end:b.end||null,p_reason:b.reason.trim().slice(0,500)})});return json({ok:true});
 }
 if(!u.employee||!uuid.test(b.establishment_id)||!['start','end'].includes(b.action))return json({error:'Pointage invalide.'},400);
 const shift=await requestDb(c,'rpc/clock_punch',{method:'POST',body:JSON.stringify({p_employee:u.employee.id,p_establishment:b.establishment_id,p_action:b.action})});return json({shift});
 }catch(e){const d=e.detail||'';return json({error:d.includes('WAIT')?'Patientez 30 secondes entre deux pointages.':d.includes('WRONG_SITE')?'Scannez le QR code du restaurant où le service a commencé.':d.includes('ALREADY_OPEN')?'Un service est déjà en cours. Actualisez la page.':d.includes('NOT_OPEN')?'Aucun service en cours. Actualisez la page.':'Opération impossible. Vérifiez les informations et réessayez.'},409)}}
