import {NextResponse} from 'next/server'

export const runtime='nodejs'

const MODEL='openai/gpt-5.6-sol'
const CATEGORIES=['Viandes','Poissons','Fruits & légumes','Épicerie','Produits laitiers','Boissons','Vins','Carburant','Autres']

export async function POST(req){
 try{
  const key=process.env.AI_GATEWAY_API_KEY
  if(!key)return NextResponse.json({error:'AI Gateway non configuré.'},{status:503})
  const form=await req.formData(),file=form.get('file'),type=form.get('type')==='z'?'z':'invoice'
  if(!file||typeof file.arrayBuffer!=='function')return NextResponse.json({error:'Image manquante.'},{status:400})
  if(!String(file.type||'').startsWith('image/'))return NextResponse.json({error:'Utilisez une photo ou une image.'},{status:400})
  if(file.size>10*1024*1024)return NextResponse.json({error:'Image trop volumineuse (10 Mo maximum).'},{status:400})
  const b64=Buffer.from(await file.arrayBuffer()).toString('base64')
  const schema=type==='invoice'?invoiceSchema:zSchema
  const instructions=type==='invoice'?invoicePrompt:zPrompt
  const body={model:MODEL,messages:[{role:'system',content:'Tu analyses des documents comptables français pour Maison Oddos. Tu dois lire uniquement ce qui est visible. N’invente jamais une valeur absente ou ambiguë. Les dates doivent venir du document, jamais de la date du scan.'},{role:'user',content:[{type:'text',text:instructions},{type:'image_url',image_url:{url:`data:${file.type};base64,${b64}`}}]}],response_format:{type:'json_schema',json_schema:{name:type==='invoice'?'supplier_invoice':'z_report',strict:true,schema}}}
  const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)})
  if(!r.ok){const t=await r.text();console.error('AI Gateway',r.status,t.slice(0,500));return NextResponse.json({error:'La lecture IA est momentanément indisponible.'},{status:502})}
  const data=await r.json();const content=data?.choices?.[0]?.message?.content
  if(!content)return NextResponse.json({error:'L’IA n’a pas retourné de lecture exploitable.'},{status:502})
  const parsed=typeof content==='string'?JSON.parse(content):content
  return NextResponse.json({ok:true,result:normalize(parsed,type),model:MODEL})
 }catch(e){console.error('scan-ai',e);return NextResponse.json({error:'Impossible d’analyser ce document.'},{status:500})}
}

const confidence={type:'number',minimum:0,maximum:1}
const field=(valueType='string')=>({type:'object',additionalProperties:false,required:['value','confidence'],properties:{value:{type:[valueType,'null']},confidence}})
const invoiceSchema={type:'object',additionalProperties:false,required:['restaurant','supplier','category','date','number','ht','vat','ttc','dueDate'],properties:{restaurant:field(),supplier:field(),category:field(),date:field(),number:field(),ht:field('number'),vat:field('number'),ttc:field('number'),dueDate:field()}}
const zSchema={type:'object',additionalProperties:false,required:['restaurant','date','ca','covers','lunch','dinner'],properties:{restaurant:field(),date:field(),ca:field('number'),covers:field('number'),lunch:field('number'),dinner:field('number')}}
const invoicePrompt=`Lis cette facture fournisseur. Retourne uniquement le JSON demandé. restaurant vaut exactement "Villa Valleyre" ou "La Maison du Parc" seulement si le document contient un indice suffisamment clair (nom, Mios, Salles ou adresse); sinon null. supplier = raison sociale du fournisseur. category doit être l'une de: ${CATEGORIES.join(', ')}. date et dueDate au format YYYY-MM-DD. number = numéro de facture. ht = total HT, vat = montant total de TVA, ttc = total TTC/net à payer. Si une valeur n'est pas clairement visible, value=null et confiance basse. Vérifie la cohérence HT + TVA ≈ TTC. Ne prends pas un prix de ligne pour un total.`
const zPrompt=`Lis ce Z de caisse. Retourne uniquement le JSON demandé. restaurant vaut exactement "Villa Valleyre" ou "La Maison du Parc" seulement si identifiable, sinon null. date au format YYYY-MM-DD et uniquement depuis le Z. ca = CA/total TTC de clôture. covers = nombre de couverts uniquement s'il est explicitement indiqué. lunch et dinner uniquement si des montants midi/déjeuner et soir/dîner sont explicitement présents; sinon null. N'invente aucune répartition midi/soir.`
function val(x){return x&&x.value!==null&&x.value!==undefined?String(x.value):''}
function num(x){return x&&typeof x.value==='number'&&Number.isFinite(x.value)?String(Math.round(x.value*100)/100):''}
function conf(x){return x&&Number.isFinite(x.confidence)?Math.max(0,Math.min(1,x.confidence)):0}
function normalize(p,type){if(type==='z')return{restaurant:val(p.restaurant),date:val(p.date),ca:num(p.ca),covers:num(p.covers),lunch:num(p.lunch),dinner:num(p.dinner),confidence:{restaurant:conf(p.restaurant),date:conf(p.date),ca:conf(p.ca),covers:conf(p.covers),lunch:conf(p.lunch),dinner:conf(p.dinner)}};return{restaurant:val(p.restaurant),supplier:val(p.supplier),category:CATEGORIES.includes(val(p.category))?val(p.category):'Autres',date:val(p.date),number:val(p.number),ht:num(p.ht),vat:num(p.vat),ttc:num(p.ttc),dueDate:val(p.dueDate),confidence:{restaurant:conf(p.restaurant),supplier:conf(p.supplier),category:conf(p.category),date:conf(p.date),number:conf(p.number),ht:conf(p.ht),vat:conf(p.vat),ttc:conf(p.ttc),dueDate:conf(p.dueDate)}}}
