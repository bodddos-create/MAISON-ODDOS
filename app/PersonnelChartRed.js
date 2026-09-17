'use client'
import {useEffect} from 'react'
import {createClient} from '@supabase/supabase-js'
const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
export default function PersonnelChartRed(){
 useEffect(()=>{
  let stop=false,observer,timer
  const draw=async()=>{
   if(stop)return
   const main=document.querySelector('main');if(!main)return
   const heading=[...main.querySelectorAll('h3')].find(x=>x.textContent?.includes('Évolution CA / Charges'));const box=heading?.closest('.formCard');const svg=box?.querySelector('svg');if(!svg)return
   const estSelect=[...main.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.textContent?.includes('CONSOLIDÉ')));const est=estSelect?.value||'all'
   let q=sb.from('employees').select('establishment_id,monthly_loaded_cost,active').eq('active',true);if(est!=='all')q=q.eq('establishment_id',est);const {data}=await q;if(stop)return
   const payroll=(data||[]).reduce((a,x)=>a+Number(x.monthly_loaded_cost||0),0),daily=payroll/22
   svg.querySelectorAll('[data-personnel-red]').forEach(x=>x.remove());box.querySelectorAll('[data-personnel-legend]').forEach(x=>x.remove());if(!daily)return
   const vb=svg.viewBox.baseVal,W=vb.width||900,H=vb.height||300,p=42
   const caPath=svg.querySelector('path');if(!caPath)return
   const values=[...svg.querySelectorAll('path')].map(pth=>pth.getAttribute('d')||'').join(' ');const ys=[...values.matchAll(/[ML][\d.]+\s+([\d.]+)/g)].map(m=>Number(m[1])).filter(Number.isFinite);const minY=ys.length?Math.min(...ys):p
   const axisTexts=[...svg.querySelectorAll('text')].map(t=>t.textContent||'');let maxLabel=Math.max(0,...axisTexts.map(t=>{const m=t.match(/([\d.,]+)k$/);return m?Number(m[1].replace(',','.'))*1000:0}))
   if(!maxLabel){const caNumbers=[...values.matchAll(/[ML]([\d.]+)\s+([\d.]+)/g)].map(m=>Number(m[2]));const top=Math.min(...caNumbers);maxLabel=top<=p+2?Math.max(payroll,1000):Math.max(payroll,1000)}
   const count=(svg.querySelectorAll('circle').length||31),n=Math.max(2,count),x=i=>p+i*(W-2*p)/(n-1),y=v=>H-p-(v/Math.max(maxLabel,payroll,1))*(H-2*p)
   const d=Array.from({length:n},(_,i)=>`${i?'L':'M'}${x(i)} ${y(daily*Math.min(i+1,22))}`).join(' ')
   const ns='http://www.w3.org/2000/svg',path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','#d32f2f');path.setAttribute('stroke-width','3');path.setAttribute('data-personnel-red','1');svg.appendChild(path)
   const legend=document.createElement('span');legend.setAttribute('data-personnel-legend','1');legend.style.color='#d32f2f';legend.style.fontWeight='700';legend.textContent='● Personnel';const legendBox=svg.previousElementSibling;if(legendBox)legendBox.appendChild(legend)
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(draw,120)};draw();observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('change',schedule)
  return()=>{stop=true;clearTimeout(timer);observer?.disconnect();document.removeEventListener('change',schedule)}
 },[])
 return null
}
