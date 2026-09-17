'use client'
import {useEffect,useMemo,useState} from 'react'
import {createClient} from '@supabase/supabase-js'

const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
const categories=['Alimentaire','Boissons','Entretien']
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0))
const monthNow=()=>new Date().toISOString().slice(0,7)
const style={width:'100%',boxSizing:'border-box',padding:11,marginTop:6}

export default function StocksPage(){
 const [user,setUser]=useState(undefined),[ests,setEsts]=useState([]),[rows,setRows]=useState([]),[invoices,setInvoices]=useState([])
 const [est,setEst]=useState(''),[month,setMonth]=useState(monthNow()),[values,setValues]=useState({}),[openingValues,setOpeningValues]=useState({}),[msg,setMsg]=useState(''),[saving,setSaving]=useState(false)
 useEffect(()=>{sb.auth.getUser().then(({data})=>setUser(data?.user||null))},[])
 useEffect(()=>{if(user)load()},[user])
 useEffect(()=>{if(ests.length&&!est)setEst(ests[0].id)},[ests,est])
 async function load(){
  const [{data:e},{data:r},{data:i}]=await Promise.all([
   sb.from('establishments').select('*').eq('active',true),
   sb.from('inventories').select('*').order('month',{ascending:false}),
   sb.from('supplier_invoices').select('establishment_id,invoice_date,category,amount_ht').order('invoice_date',{ascending:false}).limit(2000)
  ])
  setEsts(e||[]);setRows(r||[]);setInvoices(i||[])
 }
 const monthDate=month+'-01'
 const current=useMemo(()=>categories.map(category=>{
  const row=rows.find(x=>x.establishment_id===est&&x.month===monthDate&&x.category===category)
  const purchases=invoices.filter(x=>x.establishment_id===est&&x.category===category&&x.invoice_date?.startsWith(month)).reduce((a,x)=>a+Number(x.amount_ht||0),0)
  const previousMonth=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1).toISOString().slice(0,10)
  const previous=rows.find(x=>x.establishment_id===est&&x.month===previousMonth&&x.category===category)
  const opening=previous?Number(previous.closing_stock_ht||0):openingValues[category]!==undefined?Number(openingValues[category]||0):Number(row?.opening_stock_ht||0)
  const closing=values[category]!==undefined?Number(values[category]||0):Number(row?.closing_stock_ht||0)
  return{category,row,purchases,opening,closing,consumption:opening+purchases-closing,auto:!!previous}
 }),[rows,invoices,est,month,values,openingValues])
 const totals=current.reduce((a,x)=>({opening:a.opening+x.opening,purchases:a.purchases+x.purchases,closing:a.closing+x.closing,consumption:a.consumption+x.consumption}),{opening:0,purchases:0,closing:0,consumption:0})
 async function save(){
  if(!est)return setMsg('Choisissez un établissement.');setSaving(true);setMsg('')
  for(const x of current){
   const payload={establishment_id:est,month:monthDate,category:x.category,opening_stock_ht:x.opening,closing_stock_ht:x.closing,created_by:user.id}
   const {error}=await sb.from('inventories').upsert(payload,{onConflict:'establishment_id,month,category'})
   if(error){setSaving(false);return setMsg('Erreur : '+error.message)}
  }
  setValues({});setOpeningValues({});await load();setSaving(false);setMsg('✓ Stocks enregistrés. Le stock de fin sera repris automatiquement le mois suivant.')
 }
 if(user===undefined)return <main><section><div className="formCard"><h2>Stocks</h2><p>Chargement…</p></div></section></main>
 if(!user)return <main><section><div className="formCard"><h2>Connexion nécessaire</h2><a href="/"><button>Retour à la connexion</button></a></div></section></main>
 return <main><header><div><div className="brand">MAISON ODDOS</div><h1>Stocks & inventaires</h1></div><div><a href="/"><button>← Pilotage</button></a></div></header><section>
  <div className="formCard"><div className="grid"><label><b>Établissement</b><select value={est} onChange={e=>{setEst(e.target.value);setValues({});setOpeningValues({})}} style={style}>{ests.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><b>Mois</b><input type="month" value={month} onChange={e=>{setMonth(e.target.value);setValues({});setOpeningValues({})}} style={style}/></label></div></div>
  <div className="grid" style={{marginTop:20}}><Card t="Stock début HT" v={euro(totals.opening)}/><Card t="Achats HT" v={euro(totals.purchases)}/><Card t="Stock fin HT" v={euro(totals.closing)}/><Card t="Consommation réelle HT" v={euro(totals.consumption)}/></div>
  <h2 style={{marginTop:28}}>Inventaire par rubrique</h2>
  {current.map(x=><div className="formCard" key={x.category} style={{marginTop:14}}><h3>{x.category}</h3><div className="grid">{x.auto?<Card t="Stock début HT" v={euro(x.opening)}/>:<label><b>Stock début HT</b><input type="number" min="0" step="0.01" value={openingValues[x.category]??(x.row?.opening_stock_ht??'')} placeholder="0,00" onChange={e=>setOpeningValues(v=>({...v,[x.category]:e.target.value}))} style={style}/></label>}<Card t="Achats HT du mois" v={euro(x.purchases)}/><label><b>Stock fin HT</b><input type="number" min="0" step="0.01" value={values[x.category]??(x.row?.closing_stock_ht??'')} placeholder="0,00" onChange={e=>setValues(v=>({...v,[x.category]:e.target.value}))} style={style}/></label><Card t="Consommation réelle" v={euro(x.consumption)}/></div><small>{x.auto?'Stock début repris automatiquement du stock fin du mois précédent.':'Premier mois disponible : saisissez le stock de départ une seule fois.'}</small></div>)}
  <button onClick={save} disabled={saving} style={{marginTop:20,padding:13}}>{saving?'Enregistrement…':'Enregistrer les 3 stocks'}</button>{msg&&<p><b>{msg}</b></p>}
  <div className="formCard" style={{marginTop:24}}><h3>Règle de calcul</h3><p>Consommation réelle = Stock début HT + Achats HT du mois − Stock fin HT.</p><p>Les achats sont repris automatiquement depuis les factures classées Alimentaire, Boissons et Entretien.</p></div>
 </section></main>
}
function Card({t,v}){return <article className="card"><span>{t}</span><strong>{v}</strong></article>}
