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
  const check=()=>{const active=[...document.querySelectorAll('nav button.active')].some(b=>b.textContent.trim()==='Personnel');setShow(active)}
  check();const o=new MutationObserver(check);o.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});return()=>{alive=false;o.disconnect()}
 },[])
 if(!show||!data)return null
 const total=data.employees.reduce((a,e)=>a+Number(e.monthly_loaded_cost||0),0)
 const byEst=data.ests.map(est=>{const emps=data.employees.filter(e=>e.establishment_id===est.id),monthly=emps.reduce((a,e)=>a+Number(e.monthly_loaded_cost||0),0);return{...est,emps,monthly,daily:monthly/22}}).filter(x=>x.emps.length)
 return <div style={{position:'fixed',right:18,top:90,zIndex:900,width:'min(390px,calc(100vw - 36px))',maxHeight:'70vh',overflow:'auto',background:'white',border:'1px solid #ddd',borderRadius:16,padding:16,boxShadow:'0 8px 28px rgba(0,0,0,.16)'}}><h3 style={{marginTop:0}}>Coût personnel / jour</h3><p style={{margin:'4px 0 14px'}}><b>{euro(total/22)}</b> / jour — moyenne calculée sur 22 jours</p>{byEst.map(x=><div key={x.id} style={{borderTop:'1px solid #eee',padding:'10px 0'}}><b>{x.name}</b><div>{euro(x.daily)} / jour</div><small>{euro(x.monthly)} / mois ÷ 22 jours</small>{x.emps.map(e=><div key={e.id} style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:13,marginTop:5}}><span>{e.full_name}</span><span>{euro(Number(e.monthly_loaded_cost||0)/22)}</span></div>)}</div>)}</div>
}