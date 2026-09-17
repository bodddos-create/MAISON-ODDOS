'use client'
import {useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0))
export default function DirectionPersonnelCost(){
 const [employees,setEmployees]=useState([])
 useEffect(()=>{let alive=true;async function load(){const {data:u}=await sb.auth.getUser();if(!u?.user)return;const {data}=await sb.from('employees').select('establishment_id,monthly_loaded_cost,active').eq('active',true);if(alive)setEmployees(data||[])}load();const timer=setInterval(load,10000);return()=>{alive=false;clearInterval(timer)}},[])
 useEffect(()=>{const apply=()=>{const active=[...document.querySelectorAll('nav button.active')].some(b=>b.textContent.trim()==='Direction');if(!active)return;const select=[...document.querySelectorAll('main select')].find(s=>[...s.options].some(o=>o.textContent.includes('CONSOLIDÉ')));const selected=select?.value||'all';const monthly=employees.filter(e=>selected==='all'||e.establishment_id===selected).reduce((a,e)=>a+Number(e.monthly_loaded_cost||0),0);const cards=[...document.querySelectorAll('main .card')];const card=cards.find(c=>c.textContent.trim().startsWith('Personnel'));if(card){const strong=card.querySelector('strong');if(strong)strong.textContent=euro(monthly/22);let small=card.querySelector('small');if(!small){small=document.createElement('small');card.appendChild(small)}small.textContent=`Coût moyen / jour · ${euro(monthly)} / mois ÷ 22`}};apply();const o=new MutationObserver(apply);o.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','value']});document.addEventListener('change',apply);return()=>{o.disconnect();document.removeEventListener('change',apply)}},[employees])
 return null
}