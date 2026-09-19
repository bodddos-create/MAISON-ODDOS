export const runtime='nodejs'
export const dynamic='force-dynamic'

const clean=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
function restaurant(text){
 const t=clean(text)
 if(t.includes('villa valleyre')||t.includes('valleyre'))return {name:'Villa Valleyre',establishment_id:'8395bf22-99cb-4a7b-9096-ca734d583d83'}
 if(t.includes('maison du parc')||t.includes('salles'))return {name:'La Maison du Parc',establishment_id:'55c6e880-aa0c-40d6-9065-b5315b1a602a'}
 return null
}

export async function POST(req){
 const url=new URL(req.url)
 const supplied=req.headers.get('x-z-webhook-secret')||url.searchParams.get('secret')
 if(!process.env.Z_IMPORT_SECRET||supplied!==process.env.Z_IMPORT_SECRET)return Response.json({error:'Non autorisé'},{status:401})
 try{
  const ct=req.headers.get('content-type')||''
  let payload={}, searchable='', attachments=[]
  if(ct.includes('application/json')){
   payload=await req.json()
   searchable=JSON.stringify(payload)
   attachments=payload.attachments||[]
  }else{
   const form=await req.formData()
   for(const [k,v] of form.entries()){
    if(typeof v==='string'){payload[k]=v;searchable+=' '+k+' '+v}
    else attachments.push({field:k,filename:v.name,type:v.type,size:v.size})
   }
  }
  const detected=restaurant(searchable)
  return Response.json({ok:true,received:true,restaurant:detected,needs_review:!detected,attachments:attachments.map(a=>({filename:a.filename||a.name||'',type:a.contentType||a.type||'',size:a.size||0}))})
 }catch(e){return Response.json({error:'Webhook Z illisible',details:String(e?.message||e)},{status:400})}
}
