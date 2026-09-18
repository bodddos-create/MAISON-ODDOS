export async function POST(request){
 try{
  const body=await request.json()
  const brut=Number(body.brut||0)
  if(!brut||brut<=0)return Response.json({error:'Salaire brut requis'},{status:400})
  const payload={
   expressions:[
    'salarié . contrat . salaire brut',
    'salarié . cotisations . employeur',
    'salarié . cotisations . exonérations . RGDU',
    'salarié . coût total employeur'
   ],
   situation:{
    'salarié . contrat . salaire brut':brut+' €/mois',
    'salarié . contrat . temps de travail . temps partiel':Number(body.weekly_hours||35)<35?'oui':'non'
   }
  }
  const r=await fetch('https://mon-entreprise.urssaf.fr/api/v1/evaluate',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store'})
  const raw=await r.json()
  if(!r.ok)return Response.json({error:'Calcul Urssaf indisponible',details:raw},{status:502})
  const arr=Array.isArray(raw)?raw:(raw.evaluations||raw.results||[])
  const val=(name)=>{
   const x=arr.find(v=>(v.expression||v.name||v.rule)===name)
   const n=x?.nodeValue??x?.value??x?.result?.nodeValue??x?.result?.value
   return typeof n==='number'?n:Number(n?.value??n)||0
  }
  return Response.json({brut:val('salarié . contrat . salaire brut')||brut,cotisations_employeur:val('salarié . cotisations . employeur'),rgdu:Math.abs(val('salarié . cotisations . exonérations . RGDU')),cout_employeur:val('salarié . coût total employeur'),source:'Mon-entreprise / Urssaf',raw:arr.length?undefined:raw})
 }catch(e){return Response.json({error:'Erreur calcul Urssaf',details:String(e)},{status:500})}
}