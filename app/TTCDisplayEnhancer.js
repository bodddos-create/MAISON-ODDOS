'use client'
import {useEffect} from 'react'
import {createClient} from '@supabase/supabase-js'

const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0))
const VILLA='8395bf22-99cb-4a7b-9096-ca734d583d83'
const PARC='55c6e880-aa0c-40d6-9065-b5315b1a602a'
const isOpen=(est,date)=>{const d=date.getDay();if(est===VILLA)return d>=2&&d<=6;if(est===PARC)return d>=1&&d<=6;return d>=1&&d<=6}
const openDaysInMonth=(est,ym)=>{const [y,m]=ym.split('-').map(Number),days=new Date(y,m,0).getDate();let n=0;for(let i=1;i<=days;i++)if(isOpen(est,new Date(y,m-1,i)))n++;return n||1}

export default function TTCDisplayEnhancer(){
 useEffect(()=>{
  let stopped=false,timer
  const run=async()=>{
   const {data:{user}}=await sb.auth.getUser(); if(!user||stopped)return
   const [{data:sales},{data:vat},{data:invoices},{data:employees},{data:fixedCharges},{data:openingDays}]=await Promise.all([
    sb.from('daily_sales').select('id,establishment_id,business_date,lunch_sales_ht,dinner_sales_ht,lunch_covers,dinner_covers'),
    sb.from('daily_sale_vat_lines').select('daily_sale_id,amount_ttc'),
    sb.from('supplier_invoices').select('establishment_id,invoice_date,amount_ht,vat_amount'),
    sb.from('employees').select('establishment_id,monthly_loaded_cost,active').eq('active',true),
    sb.from('fixed_charges').select('establishment_id,month,end_month,recurring,amount,amount_ttc'),
    sb.from('opening_days').select('establishment_id,business_date,is_open')
   ])
   const vatBySale={}; (vat||[]).forEach(v=>vatBySale[v.daily_sale_id]=(vatBySale[v.daily_sale_id]||0)+Number(v.amount_ttc||0))
   const rows=(sales||[]).map(s=>{const ht=Number(s.lunch_sales_ht||0)+Number(s.dinner_sales_ht||0);return{...s,ttc:Object.prototype.hasOwnProperty.call(vatBySale,s.id)?vatBySale[s.id]:ht,covers:Number(s.lunch_covers||0)+Number(s.dinner_covers||0)}})
   const apply=()=>{
    if(stopped)return
    const main=document.querySelector('main'); if(!main)return
    const estSelect=[...main.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.textContent?.includes('CONSOLIDÉ')))
    const est=estSelect?.value||'all'
    const monthInput=main.querySelector('input[type="month"]')
    const ym=monthInput?.value||new Date().toISOString().slice(0,7)
    const filtered=est==='all'?rows:rows.filter(x=>x.establishment_id===est)
    const inv=est==='all'?(invoices||[]):(invoices||[]).filter(x=>x.establishment_id===est)
    const emps=est==='all'?(employees||[]):(employees||[]).filter(x=>x.establishment_id===est)
    const fixes=est==='all'?(fixedCharges||[]):(fixedCharges||[]).filter(x=>x.establishment_id===est)
    const ca=filtered.reduce((a,x)=>a+x.ttc,0)
    const covers=filtered.reduce((a,x)=>a+x.covers,0)
    const days=new Set(filtered.filter(x=>x.ttc>0).map(x=>x.business_date)).size
    const avg=days?ca/days:0
    const achats=inv.reduce((a,x)=>a+Number(x.amount_ht||0)+Number(x.vat_amount||0),0)
    const realOpenDays=id=>{const custom=(openingDays||[]).filter(x=>x.establishment_id===id&&String(x.business_date).startsWith(ym));if(custom.length){const [y,m]=ym.split('-').map(Number),n=new Date(y,m,0).getDate(),by=Object.fromEntries(custom.map(x=>[x.business_date,x.is_open]));let total=0;for(let d=1;d<=n;d++){const ds=ym+'-'+String(d).padStart(2,'0');if(ds in by?by[ds]:isOpen(id,new Date(y,m-1,d)))total++}return total||1}return openDaysInMonth(id,ym)}
    const payroll=emps.reduce((a,x)=>a+Number(x.monthly_loaded_cost||0),0)
    const payrollByEst={};emps.forEach(e=>payrollByEst[e.establishment_id]=(payrollByEst[e.establishment_id]||0)+Number(e.monthly_loaded_cost||0))
    const personnelDay=Object.entries(payrollByEst).reduce((sum,[id,total])=>sum+total/realOpenDays(id),0)
    const chargeApplies=(x,m)=>{const start=String(x.month||'').slice(0,7),end=String(x.end_month||'').slice(0,7);return x.recurring?start<=m&&(!end||end>=m):start===m};const monthFixes=fixes.filter(x=>chargeApplies(x,ym));const fixedTotal=monthFixes.reduce((a,x)=>a+Number(x.amount_ttc!=null?x.amount_ttc:x.amount||0),0)
    const estimatedResult=ca-achats-payroll-fixedTotal
    const estIds=est==='all'?[VILLA,PARC]:[est]
    const monthInv=inv.filter(x=>String(x.invoice_date||'').slice(0,7)===ym)
    const monthFix=monthFixes
    const dailyPurchases=estIds.reduce((sum,id)=>sum+monthInv.filter(x=>x.establishment_id===id).reduce((a,x)=>a+Number(x.amount_ht||0)+Number(x.vat_amount||0),0)/realOpenDays(id),0)
    const dailyFixed=estIds.reduce((sum,id)=>sum+monthFix.filter(x=>x.establishment_id===id).reduce((a,x)=>a+Number(x.amount_ttc!=null?x.amount_ttc:x.amount||0),0)/realOpenDays(id),0)
    const dailyFixedPersonnel=personnelDay+dailyFixed
    const dailyCost=personnelDay+dailyPurchases+dailyFixed
    const setCard=(title,val)=>{[...main.querySelectorAll('.card')].forEach(c=>{const s=c.querySelector('span'),b=c.querySelector('strong');if(s?.textContent===title&&b)b.textContent=val})}
    const hero=[...main.querySelectorAll('.hero small')].find(x=>x.textContent?.includes("Chiffre d’affaires")); if(hero){hero.textContent="Chiffre d’affaires TTC enregistré";const h=hero.parentElement?.querySelector('h2');if(h)h.textContent=money(ca)}
    const result=main.querySelector('.hero .result strong');if(result)result.textContent=money(estimatedResult)
    setCard('CA estimé sur 22 jours',money(avg*22)); setCard('CA estimé sur 22 jours TTC',money(avg*22))
    setCard('CA moyen / jour',money(avg)); setCard('CA moyen / jour TTC',money(avg))
    setCard('Ticket moyen',money(covers?ca/covers:0)); setCard('Ticket moyen TTC',money(covers?ca/covers:0))
    setCard('Achats',money(achats)); setCard('Achats TTC',money(achats))
    const purchaseCard=[...main.querySelectorAll('.card')].find(c=>c.querySelector('span')?.textContent?.trim()==='Achats TTC');if(purchaseCard){let pct=purchaseCard.querySelector('[data-purchase-rate]');if(!pct){pct=document.createElement('div');pct.dataset.purchaseRate='true';pct.style.cssText='margin-top:8px;font-size:13px;font-weight:800;padding:5px 9px;border-radius:8px;display:inline-block;color:#2f6b3a;background:#e8f3e8';purchaseCard.appendChild(pct)}const caHt=filtered.reduce((a,x)=>a+Number(x.lunch_sales_ht||0)+Number(x.dinner_sales_ht||0),0),achatsHt=inv.reduce((a,x)=>a+Number(x.amount_ht||0),0),pctTtc=ca?achats/ca*100:0,pctHt=caHt?achatsHt/caHt*100:0;pct.innerHTML=pctTtc.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' % du CA TTC<br><span style="font-size:12px;font-weight:700">'+pctHt.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' % du CA HT</span>'}
    setCard('Personnel',money(personnelDay)); setCard('Personnel moyen / jour (22j)',money(personnelDay));setCard('Personnel moyen / jour',money(personnelDay))
    setCard('Charges fixes',money(fixedTotal))
    const addRate=(title,key,ttcValue,htValue)=>{const card=[...main.querySelectorAll('.card')].find(c=>c.querySelector('span')?.textContent?.trim()===title);if(!card)return;let box=card.querySelector('[data-rate="'+key+'"]');if(!box){box=document.createElement('div');box.dataset.rate=key;box.style.cssText='margin-top:8px;font-size:13px;font-weight:800;padding:5px 9px;border-radius:8px;display:inline-block;color:#2f6b3a;background:#e8f3e8';card.appendChild(box)}const ttcPct=ca?ttcValue/ca*100:0,htPct=caHt?htValue/caHt*100:0;box.innerHTML=ttcPct.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' % du CA TTC<br><span style="font-size:12px;font-weight:700">'+htPct.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' % du CA HT</span>'}
    const fixedHt=monthFixes.reduce((a,x)=>a+Number(x.amount||0),0);addRate('Charges fixes','fixed',fixedTotal,fixedHt);addRate('Personnel','personnel',payroll,payroll)
    setCard('Marge après charges',money(estimatedResult))
    const fixedPersonnelCard=main.querySelector('[data-daily-fixed-personnel="true"] strong');if(fixedPersonnelCard)fixedPersonnelCard.textContent=money(dailyFixedPersonnel)
    const dailyCostCard=main.querySelector('[data-daily-cost="true"] strong');if(dailyCostCard)dailyCostCard.textContent=money(dailyCost)
    const avgCard=[...main.querySelectorAll('.card')].find(c=>c.querySelector('span')?.textContent?.trim()==='CA moyen / jour TTC');if(avgCard){let delta=avgCard.querySelector('[data-daily-balance]');if(!delta){delta=document.createElement('div');delta.dataset.dailyBalance='true';delta.style.cssText='margin-top:8px;font-size:13px;font-weight:800;padding:5px 9px;border-radius:8px;display:inline-block';avgCard.appendChild(delta)}const balance=avg-dailyCost;delta.textContent=(balance>=0?'+':'')+money(balance)+' vs coût journalier';delta.style.color=balance>=0?'#2f6b3a':'#b42318';delta.style.background=balance>=0?'#e8f3e8':'#fde8e7'}
    ;[...main.querySelectorAll('.card span')].forEach(s=>{if(s.textContent==='Personnel moyen / jour (22j)')s.textContent='Personnel moyen / jour d’ouverture';if(['CA estimé sur 22 jours','CA moyen / jour','Ticket moyen','Achats'].includes(s.textContent)&&!s.textContent.includes('TTC'))s.textContent+=' TTC'})
    ;[...main.querySelectorAll('th')].forEach(th=>{if(th.textContent==='CA HT')th.textContent='CA TTC'})
    const lastHeading=[...main.querySelectorAll('h3')].find(h=>h.textContent?.trim()==='Dernières journées')
    const lastTable=lastHeading?.nextElementSibling
    if(lastTable?.tagName==='TABLE'||lastTable?.querySelector?.('table')){
     const table=lastTable.tagName==='TABLE'?lastTable:lastTable.querySelector('table')
     ;[...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{const cells=tr.querySelectorAll('td');const sale=filtered[i];if(cells[2]&&sale)cells[2].textContent=money(sale.ttc)})
    }
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
