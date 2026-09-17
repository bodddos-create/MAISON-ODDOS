'use client'
import {useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0))
const VILLA='8395bf22-99cb-4a7b-9096-ca734d583d83',PARC='55c6e880-aa0c-40d6-9065-b5315b1a602a'
const openDay=(id,d)=>id===VILLA?(d>=2&&d<=6):id===PARC?(d>=1&&d<=6):(d>=1&&d<=6)
const openDays=(id,date=new Date())=>{const y=date.getFullYear(),m=date.getMonth(),n=new Date(y,m+1,0).getDate();let c=0;for(let i=1;i<=n;i++)if(openDay(id,new Date(y,m,i).getDay()))c++;return c||1}
export default function PersonnelDailyCost(){
 const [data,setData]=useState(null),[show,setShow]=useState(false)
 useEffect(()=>{let alive=true
  async function load(){const {data:u}=await sb.auth.getUser();if(!u?.user)return;const [{data:e},{data:ests}]=await Promise.all([sb.from('employees').select('id,establishment_id,full_name,monthly_loaded_cost,active').eq('active',true),sb.from('establishments').select('id,name').eq('active',true)]);if(alive)setData({employees:e||[],ests:ests||[]})}
  load()
  const check=()=>{const active=[...document.querySelectorAll('nav button.active')].some(b=>b.textContent.trim()==='Personnel');setShow(active);if(active)load()}
  check();const o=new MutationObserver(check);o.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});return()=>{alive=false;o.disconnect()}
 },[])
 if(!show||!data)return null
 const byEst=data.ests.map(est=>{const emps=data.employees.filter(e=>e.establishment_id===est.id),monthly=emps.reduce((a,e)=>a+Number(e.monthly_loaded_cost||0),0),days=openDays(est.id);return{...est,emps,monthly,days,daily:monthly/days}}).filter(x=>x.emps.length)
 const totalMonthly=byEst.reduce((a,x)=>a+x.monthly,0),totalDaily=byEst.reduce((a,x)=>a+x.daily,0)
 return <section style={{paddingTop:0}}><div className="formCard" style={{marginTop:18}}><h3 style={{marginTop:0}}>Coût personnel moyen / jour d’ouverture</h3><p><b>{euro(totalDaily)}</b> / jour — calculé selon les jours d’ouverture réels du mois</p><div className="grid">{byEst.map(x=><article className="card" key={x.id}><span>{x.name}</span><strong>{euro(x.daily)} / jour</strong><small>{euro(x.monthly)} / mois ÷ {x.days} jours d’ouverture</small></article>)}</div><small>Masse salariale chargée active totale : {euro(totalMonthly)}</small></div></section>
}