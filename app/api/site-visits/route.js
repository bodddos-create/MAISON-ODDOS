import {NextResponse} from 'next/server';
import {siteOrigins,validVisit} from '../../../lib/website-visits.mjs';
import {restaurants} from '../../../lib/group-enquiries.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
function config(){const url=process.env.SUPABASE_URL?.replace(/\/$/,'');const key=process.env.SUPABASE_SECRET_KEY;if(!url||!key)throw new Error('Unavailable');return {url,key};}
async function db(path,options={}){const {url,key}=config();const r=await fetch(`${url}/rest/v1/${path}`,{...options,cache:'no-store',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers}});if(!r.ok)throw new Error('Database unavailable');return r.status===204?null:r.json();}
function cors(request){const origin=request.headers.get('origin');return siteOrigins[origin]?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}:{};}
export function OPTIONS(request){return new Response(null,{status:siteOrigins[request.headers.get('origin')]?204:403,headers:{...headers,...cors(request)}});}
export async function POST(request){
 const origin=request.headers.get('origin'); const h={...headers,...cors(request)};
 if(!siteOrigins[origin])return new Response(null,{status:403,headers:h});
 if(/bot|crawler|spider|preview|headless/i.test(request.headers.get('user-agent')||''))return new Response(null,{status:204,headers:h});
 try{if(Number(request.headers.get('content-length')||0)>1024)return new Response(null,{status:413,headers:h});const raw=await request.text();if(raw.length>1024)return new Response(null,{status:413,headers:h});let body;try{body=JSON.parse(raw);}catch{return new Response(null,{status:400,headers:h});}if(!validVisit(body))return new Response(null,{status:400,headers:h});
 await db('rpc/record_website_visit',{method:'POST',body:JSON.stringify({p_site:siteOrigins[origin],p_session:body.session_id,p_event:body.event_id})});return new Response(null,{status:204,headers:h});
 }catch{return new Response(null,{status:503,headers:h});}
}
export async function GET(request){
 try{const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer '))return NextResponse.json({error:'Connexion requise.'},{status:401,headers});const {url,key}=config();const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:auth},cache:'no-store'});if(!r.ok)return NextResponse.json({error:'Connexion requise.'},{status:401,headers});const user=await r.json();const profiles=await db(`profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role,establishment_id&limit=1`);const p=profiles[0];if(!p||!['direction','administratif','restaurant'].includes(p.role))return NextResponse.json({error:'Accès non autorisé.'},{status:403,headers});const management=['direction','administratif'].includes(p.role);const site=Object.keys(restaurants).find(k=>restaurants[k].establishmentId===p.establishment_id);if(!management&&!site)return NextResponse.json({error:'Accès non autorisé.'},{status:403,headers});const since=new Date(Date.now()-30*86400000).toISOString().slice(0,10);const rows=await db(`website_daily_metrics?select=site,day,pageviews,visits&day=gte.${since}&order=day.desc${management?'':`&site=eq.${site}`}`);return NextResponse.json({rows,sites:management?['villa','parc']:[site]},{headers});
 }catch{return NextResponse.json({error:'Statistiques momentanément indisponibles.'},{status:503,headers});}
}
