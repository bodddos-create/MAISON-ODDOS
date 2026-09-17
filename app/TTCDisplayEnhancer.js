'use client'
import {useEffect} from 'react'
import {createClient} from '@supabase/supabase-js'

const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0))

export default function TTCDisplayEnhancer(){
 useEffect(()=>{
  let stopped=false,timer
  const run=async()=>{
   const {data:{user}}=await sb.auth.getUser(); if(!user||stopped)return
   const [{data:sales},{data:vat},{data:invoices},{data:employees},{data:fixedCharges}]=await Promise.all([
    sb.from('daily_sales').select('id,establishment_id,business_date,lunch_sales_ht,dinner_sales_ht,lunch_covers,dinner_covers'),
    sb.from('daily_sale_vat_lines').select('daily_sale_id,amount_ttc'),
    sb.from('supplier_invoices').select('establishment_id,amount_ht,vat_amount'),
    sb.from('employees').select('establishment_id,monthly_loaded_cost,active').eq('active',true),
    sb.from('fixed_charges').select('establishment_id,amount')
   ])
   const vatBySale={}; (vat||[]).forEach(v=>vatBySale[v.daily_sale_id]=(vatBySale[v.daily_sale_id]||0)+Number(v.amount_ttc||0))
   const rows=(sales||[]).map(s=>{const ht=Number(s.lunch_sales_ht||0)+Number(s.dinner_sales_ht||0);return{...s,ttc:Object.prototype.hasOwnProperty.call(vatBySale,s.id)?vatBySale[s.id]:ht,covers:Number(s.lunch_covers||0)+Number(s.dinner_covers||0)}})
   const apply=()=>{
    if(stopped)return
    const main=document.querySelector('main'); if(!main)return
    const estSelect=[...main.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.textContent?.includes('CONSOLIDÉ')))
    const est=estSelect?.value||'all'
    const filtered=est==='all'?rows:rows.filter(x=>x.establishment_id===est)
    const inv=est==='all'?(invoices||[]):(invoices||[]).filter(x=>x.establishment_id===est)
    const emps=est==='all'?(employees||[]):(employees||[]).filter(x=>x.establishment_id===est)
    const fixes=est==='all'?(fixedCharges||[]):(fixedCharges||[]).filter(x=>x.establishment_id===est)
    const ca=filtered.reduce((a,x)=>a+x.ttc,0)
    const covers=filtered.reduce((a,x)=>a+x.covers,0)
    const days=new Set(filtered.filter(x=>x.ttc>0).map(x=>x.business_date)).size
    const avg=days?ca/days:0
    const achats=inv.reduce((a,x)=>a+Number(x.amount_ht||0)+Number(x.vat_amount||0),0)
    const payroll=emps.reduce((a,x)=>a+Number(x.monthly_loaded_cost||0),0)
    const personnelDay=payroll/22
    const fixedTotal=fixes.reduce((a,x)=>a+Number(x.amount||0),0)
    const estimatedResult=ca-achats-payroll-fixedTotal
    const setCard=(title,val)=>{[...main.querySelectorAll('.card')].forEach(c=>{const s=c.querySelector('span'),b=c.querySelector('strong');if(s?.textContent===title&&b)b.textContent=val})}
    const hero=[...main.querySelectorAll('.hero small')].find(x=>x.textContent?.includes("Chiffre d’affaires")); if(hero){hero.textContent="Chiffre d’affaires TTC enregistré";const h=hero.parentElement?.querySelector('h2');if(h)h.textContent=money(ca)}
    const result=main.querySelector('.hero .result strong');if(result)result.textContent=money(estimatedResult)
    setCard('CA estimé sur 22 jours',money(avg*22)); setCard('CA estimé sur 22 jours TTC',money(avg*22))
    setCard('CA moyen / jour',money(avg)); setCard('CA moyen / jour TTC',money(avg))
    setCard('Ticket moyen',money(covers?ca/covers:0)); setCard('Ticket moyen TTC',money(covers?ca/covers:0))
    setCard('Achats',money(achats)); setCard('Achats TTC',money(achats))
    setCard('Personnel',money(personnelDay)); setCard('Personnel moyen / jour (22j)',money(personnelDay))
    setCard('Charges fixes',money(fixedTotal))
    setCard('Marge après charges',money(estimatedResult))
    ;[...main.querySelectorAll('.card span')].forEach(s=>{if(['CA estimé sur 22 jours','CA moyen / jour','Ticket moyen','Achats'].includes(s.textContent)&&!s.textContent.includes('TTC'))s.textContent+=' TTC'})
    ;[...main.querySelectorAll('th')].forEach(th=>{if(th.textContent==='CA HT')th.textContent='CA TTC'})
    ;[...main.querySelectorAll('small')].forEach(s=>{if(s.textContent?.startsWith('Charges = achats + personnel'))s.textContent='Graphique de gestion conservé en HT : achats + personnel + charges fixes. L’écart représente CA HT − charges.'})
   }
   apply(); const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(apply,40)});obs.observe(document.body,{childList:true,subtree:true})
   document.addEventListener('change',apply); return()=>{obs.disconnect();document.removeEventListener('change',apply)}
  }
  let cleanup;run().then(c=>cleanup=c)
  return()=>{stopped=true;clearTimeout(timer);cleanup?.()}
 },[])
 return null
}
