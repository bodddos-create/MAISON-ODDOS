import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import pdf from 'pdf-parse'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const json=(data,status=200)=>Response.json(data,{status})
const allowed=()=>process.env.Z_MAIL_USER&&process.env.Z_MAIL_PASSWORD&&process.env.Z_IMPORT_SECRET

export async function POST(req){
 if(!allowed())return json({error:'Configuration Z mail incomplète' },503)
 const auth=req.headers.get('authorization')||''
 if(auth!==`Bearer ${process.env.Z_IMPORT_SECRET}`)return json({error:'Non autorisé'},401)
 const client=new ImapFlow({
  host:process.env.Z_MAIL_HOST||'ssl0.ovh.net',
  port:Number(process.env.Z_MAIL_PORT||993),
  secure:true,
  auth:{user:process.env.Z_MAIL_USER,password:process.env.Z_MAIL_PASSWORD},
  logger:false
 })
 try{
  await client.connect()
  const lock=await client.getMailboxLock('INBOX')
  try{
   const ids=await client.search({seen:false})
   const out=[]
   for(const uid of ids.slice(-20)){
    const msg=await client.fetchOne(uid,{source:true,envelope:true,flags:true},{uid:true})
    const parsed=await simpleParser(msg.source)
    const pdfs=[]
    for(const a of parsed.attachments||[]){
     if(a.contentType==='application/pdf'||/\.pdf$/i.test(a.filename||'')){
      let text=''
      try{text=(await pdf(a.content)).text||''}catch(e){text=''}
      pdfs.push({filename:a.filename||'z.pdf',size:a.size||a.content?.length||0,text:text.slice(0,30000)})
     }
    }
    out.push({uid,from:parsed.from?.text||'',subject:parsed.subject||'',date:parsed.date||null,pdfs})
   }
   return json({ok:true,count:out.length,messages:out})
  }finally{lock.release()}
 }catch(e){return json({error:'Lecture boîte Z impossible',details:String(e?.message||e)},502)}
 finally{try{await client.logout()}catch{}}
}
