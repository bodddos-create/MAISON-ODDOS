'use client'
import {useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0))
export default function DirectionPersonnelCost(){
 const [employees,setEmployees]=useState([])
 useEffect(()=>{let alive=true;async function load(){const {data:u}=await sb.auth.getUser();if(!u?.user)return;const {data}=await sb.from('employees').select('establishment_id,monthly_loaded_cost,active').eq('active',true);if(alive)setEmployees(data||[])}load();const timer=setInterval(load,5000);return()=>{alive=false;clearInterval(timer)}},[])
 useEffect(()=>{const apply=()=>{
  const direction=[...document.querySelectorAll('nav button')].find(b=>b.textContent.trim()==='Direction');if(direction&&!direction.classList.contains('active'))return
  const select=[...document.querySelectorAll('main select')].find(s=>[...s.options].some(o=>o.textContent.includes('CONSOLIDÉ'))),selected=select?.value||'all'
  const monthly=employees.filter(e=>selected==='all'||e.establishment_id===selected).reduce((a,e)=>a+Number(e.monthly_loaded_cost||0),0),daily=monthly/22
  const card=[...document.querySelectorAll('main article.card')].find(c=>c.querySelector('span')?.textContent.trim()==='Personnel')
  if(card){const amount=card.querySelector('strong');if(amount)amount.textContent=euro(daily);let detail=card.querySelector('[data-personnel-cost-detail]');if(!detail){detail=document.createElement('small');detail.dataset.personnelCostDetail='1';detail.style.cssText='display:block;margin-top:6px;opacity:.7';card.appendChild(detail)}detail.textContent=`Moyenne / jour · ${euro(monthly)} / mois ÷ 22`}
  const heading=[...document.querySelectorAll('main h3')].find(h=>h.textContent.includes('Évolution CA / Charges')),box=heading?.closest('.formCard'),svg=box?.querySelector('svg');if(!svg)return
  let legend=box.querySelector('[data-personnel-legend]');if(!legend){const first=svg.parentElement?.querySelector('div');if(first){legend=document.createElement('b');legend.dataset.personnelLegend='1';legend.textContent='Personnel';legend.style.cssText='margin-left:18px;text-decoration:underline;text-decoration-style:dashed';first.appendChild(legend)}}
  svg.querySelector('[data-personnel-line]')?.remove();svg.querySelector('[data-personnel-points]')?.remove()
  if(!monthly)return
  const texts=[...svg.querySelectorAll('text')],axis=texts.map(t=>({t:t.textContent.trim(),y:Number(t.getAttribute('y'))})).filter(x=>/^\d+k$/.test(x.t));const maxK=Math.max(0,...axis.map(x=>Number(x.t.replace('k',''))));if(!maxK)return
  const W=900,H=300,p=42,max=maxK*1000,monthInput=box.querySelector('input[type="month"]'),yearInput=box.querySelector('input[type="number"]'),isMonth=!!monthInput
  const count=isMonth?new Date(Number((monthInput?.value||'2026-01').slice(0,4)),Number((monthInput?.value||'2026-01').slice(5,7)),0).getDate():12
  const x=i=>p+i*(W-2*p)/Math.max(1,count-1),y=v=>H-p-(Number(v||0)/max)*(H-2*p)
  const vals=Array.from({length:count},(_,i)=>isMonth?daily*(i+1):monthly),d=vals.map((v,i)=>(i?'L':'M')+x(i)+' '+y(v)).join(' ')
  const ns='http://www.w3.org/2000/svg',path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','3');path.setAttribute('stroke-dasharray','14 5 3 5');path.setAttribute('opacity','.9');path.dataset.personnelLine='1';svg.appendChild(path)
  const g=document.createElementNS(ns,'g');g.dataset.personnelPoints='1';vals.forEach((v,i)=>{const c=document.createElementNS(ns,'circle');c.setAttribute('cx',x(i));c.setAttribute('cy',y(v));c.setAttribute('r','2.5');c.setAttribute('fill','currentColor');const title=document.createElementNS(ns,'title');title.textContent=`Personnel ${euro(v)}`;c.appendChild(title);g.appendChild(c)});svg.appendChild(g)
 };apply();const timer=setInterval(apply,500);document.addEventListener('change',apply,true);return()=>{clearInterval(timer);document.removeEventListener('change',apply,true)}},[employees])
 return null
}