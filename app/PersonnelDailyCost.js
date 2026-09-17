'use client'
import {useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0))
export default function PersonnelDailyCost(){
 const [data,setData]=useState(null),[show,setShow]=useState(false)
 useEffect(()=>{let alive=true
  async function load(){const {data:u}=await sb.auth.getUser();if(!u?.user)return;const [{data:e},{data:ests}]=await Promise.all([sb.from('employees').select('id,establishment_id,full_name,monthly_loaded_cost,active').eq('active',true),sb.from('establishments').select('id,name').eq('active',true)]);if(alive)setData({employees:e||[],ests:ests||[]})}
  load()
  const check=()=>{const active=[...document.querySelectorAll('nav button.active')].some(b=>b.textContent.trim()==='Personnel');setShow(active);if(active)load()}
  check();const o=new MutationObserver(check);o.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});return()=>{alive=false;o.disconnect()}
 },[])
 if(!show||!data)return null
 const total=data.employees.reduce((a,e)=>a+Number(e.monthly_loaded_cost||0),0)
 const byEst=data.ests.map(est=>{const emps=data.employees.filter(e=>e.establishment_id===est.id),monthly=emps.reduce((a,e)=>a+Number(e.monthly_loaded_cost||0),0);return{...est,emps,monthly,daily:monthly/22}}).filter(x=>x.emps.length)
 return <section style={{paddingTop:0}}><div className="formCard" style={{marginTop:18}}><h3 style={{marginTop:0}}>Coût personnel moyen / jour</h3><p><b>{euro(total/22)}</b> / jour — masse salariale chargée active ÷ 22 jours</p><div className="grid">{byEst.map(x=><article className="card" key={x.id}><span>{x.name}</span><strong>{euro(x.daily)} / jour</strong><small>{euro(x.monthly)} / mois ÷ 22</small></article>)}</div></div></section>
}