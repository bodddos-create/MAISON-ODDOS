'use client'
import {useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0))
const input={width:'100%',boxSizing:'border-box',padding:9,marginTop:4}
export default function PersonnelManager(){
 const [user,setUser]=useState(null),[rows,setRows]=useState([]),[edit,setEdit]=useState(null),[msg,setMsg]=useState('')
 async function load(){const {data}=await sb.from('employees').select('*').order('full_name');setRows(data||[])}
 useEffect(()=>{sb.auth.getUser().then(({data})=>{setUser(data?.user||null);if(data?.user)load()})},[])
 useEffect(()=>{if(!user)return;const timer=setInterval(()=>{const personnel=[...document.querySelectorAll('nav button')].find(b=>b.textContent.trim()==='Personnel');if(!personnel)return;const active=personnel.classList.contains('active');let host=document.getElementById('personnel-manager');if(active&&!host){const sections=[...document.querySelectorAll('main section')];const s=sections.find(x=>x.textContent.includes('Masse salariale')||x.textContent.includes('Salariés'));if(s){host=document.createElement('div');host.id='personnel-manager';s.appendChild(host);setRows(r=>[...r])}}else if(!active&&host)host.remove()},500);return()=>clearInterval(timer)},[user])
 async function save(e){e.preventDefault();if(!edit)return;const weekly=Number(edit.weekly_hours||0),net=Number(edit.net_salary||0),sal=Number(edit.employee_charge_rate||0),pat=Number(edit.employer_charge_rate||0),brut=sal<100?net/(1-sal/100):0,cost=brut+brut*pat/100,monthlyHours=weekly*52/12;const payload={full_name:edit.full_name.trim(),job_title:(edit.job_title||'').trim(),contract_type:edit.contract_type,weekly_hours:weekly,net_salary:net,employee_charge_rate:sal,employer_charge_rate:pat,monthly_loaded_cost:cost,hourly_cost:monthlyHours?cost/monthlyHours:0,active:edit.active};const {error}=await sb.from('employees').update(payload).eq('id',edit.id);if(error)return setMsg('Erreur : '+error.message);setMsg('✓ Salarié modifié.');setEdit(null);await load()}
 async function remove(r){if(!window.confirm(`Supprimer ${r.full_name} ? Cette action supprimera aussi son historique d’heures si la base l’autorise.`))return;let {error}=await sb.from('employees').delete().eq('id',r.id);if(error&&String(error.message).toLowerCase().includes('foreign key')){await sb.from('employee_hours').delete().eq('employee_id',r.id);({error}=await sb.from('employees').delete().eq('id',r.id))}if(error)return setMsg('Suppression impossible : '+error.message);setMsg('✓ Salarié supprimé.');setEdit(null);await load()}
 if(!user)return null
 const host=typeof document!=='undefined'&&document.getElementById('personnel-manager')
 if(!host)return null
 return null
}
