import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../app/api/pointage/route.js',import.meta.url),'utf8'))
.replace("'next/server'",JSON.stringify(new URL('../node_modules/next/server.js',import.meta.url).href))
.replace("'../../../lib/roue-server'",JSON.stringify(new URL('../lib/roue-server.js',import.meta.url).href));
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('Clock access isolates employees, refuses inactive access and protects management actions',async()=>{
 process.env.SUPABASE_URL='https://db.test';process.env.SUPABASE_SECRET_KEY='fixture';
 const original=globalThis.fetch,employee='00000000-0000-4000-8000-000000000001',site='00000000-0000-4000-8000-000000000002';let active=true,queries=[],rpc=[];
 globalThis.fetch=async(url,options)=>{
 queries.push(url);
 if(url.includes('/clock_access?'))return Response.json([{employee_id:employee}]);
 if(url.includes('/employees?'))return Response.json(active?[{id:employee,full_name:'Fixture'}]:[]);
 if(url.includes('/rpc/')){rpc.push(JSON.parse(options.body));return Response.json({id:'shift',started_at:'2026-11-11T09:00:00Z'});}
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'manager'});
 if(url.includes('/profiles?'))return Response.json([{role:'direction'}]);
 return Response.json([]);
 };
 const req=(body,extra={})=>new Request('https://app.test/api/pointage',{method:'POST',headers:{origin:'https://app.test','x-clock-token':'a'.repeat(48),...extra},body:JSON.stringify(body)});
 try{
 assert.equal((await GET(new Request('https://app.test/api/pointage'))).status,401);
 assert.equal((await GET(new Request('https://app.test/api/pointage',{headers:{'x-clock-token':'a'.repeat(48)}}))).status,200);
 assert.ok(queries.filter(q=>q.includes('/clock_shifts?')).every(q=>q.includes('employee_id=eq.'+employee)));
 assert.equal((await POST(req({action:'access',employee_id:employee}))).status,400);
 assert.equal((await POST(req({action:'start',employee_id:'other',establishment_id:site}))).status,200);
 assert.equal(rpc[0].p_employee,employee);
 assert.equal((await POST(req({action:'end',establishment_id:site},{origin:'https://foreign.test'}))).status,403);
 active=false;assert.equal((await POST(req({action:'start',establishment_id:site}))).status,401);
 active=true;assert.equal((await POST(req({action:'correct',id:employee,start:'invalid',reason:'motif'},{authorization:'Bearer fixture'}))).status,400);
 }finally{globalThis.fetch=original;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;}
});
