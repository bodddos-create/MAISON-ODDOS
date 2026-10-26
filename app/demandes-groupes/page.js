'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { restaurants } from '../../lib/group-enquiries.mjs';
const sb = createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE');
const states = { new: 'Nouvelle demande', contacted: 'Client contacté', quoted: 'Devis envoyé', confirmed: 'Confirmée', closed: 'Classée' };
export default function DemandesGroupes() {
  const [rows,setRows]=useState([]),[filter,setFilter]=useState('all'),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState('');
  async function call(method='GET',body) {
    const {data}=await sb.auth.getSession();
    if(!data.session) throw new Error('Connectez-vous à Pilotage pour consulter les demandes.');
    const response=await fetch('/api/groupes',{method,headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||'Erreur de chargement.');
    return result;
  }
  async function load(){setLoading(true);try{const result=await call();setRows(result.enquiries);setNotice('');}catch(e){setNotice(e.message);}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  async function change(row,patch){setBusy(row.id);try{const r=await call('PATCH',{id:row.id,...patch});if(!r.ok)throw new Error('L’envoi email a échoué. La demande reste enregistrée.');await load();}catch(e){setNotice(e.message);}finally{setBusy('');}}
  const visible=rows.filter(r=>filter==='all'||r.restaurant===filter);
  return <main><header><div><div className="brand">MAISON ODDOS · PILOTAGE</div><h1>Groupes & privatisation</h1><p>Demandes reçues depuis les deux sites.</p></div><a href="/">Retour au pilotage</a></header><nav><button onClick={load} disabled={loading}>Actualiser</button><a href="/groupes" target="_blank" rel="noreferrer">Voir le formulaire client</a></nav>{notice&&<p role="alert" className="message">{notice}</p>}<label style={{maxWidth:300,marginBottom:24}}>Restaurant<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Les deux restaurants</option><option value="villa">Villa Valleyre</option><option value="parc">La Maison du Parc</option></select></label>{loading?<p>Chargement…</p>:<p>{visible.length} demande(s) affichée(s) · {visible.filter(r=>r.status==='new').length} à traiter. Les 300 demandes les plus récentes sont affichées.</p>}<div style={{display:'grid',gap:18}}>{visible.map(row=><article key={row.id} className="formCard" style={{maxWidth:'none'}}><div style={{display:'flex',justifyContent:'space-between',gap:20,flexWrap:'wrap'}}><div><small>{restaurants[row.restaurant]?.name} · Reçue le {new Date(row.created_at).toLocaleString('fr-FR')}</small><h2 style={{margin:'8px 0'}}>{row.occasion} · {row.guests} personnes</h2><p>{new Date(`${row.event_date}T12:00:00`).toLocaleDateString('fr-FR')} · {row.start_time.slice(0,5)}{row.end_time?` – ${row.end_time.slice(0,5)}`:''} · {row.flexibility}</p></div><label>Suivi<select value={row.status} disabled={busy===row.id} onChange={e=>change(row,{status:e.target.value})}>{Object.entries(states).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div><p><strong>{row.full_name}</strong>{row.company?` · ${row.company}`:''}<br/><a href={`mailto:${row.email}`}>{row.email}</a> · <a href={`tel:${row.phone}`}>{row.phone}</a></p><p>Budget : {row.budget||'À discuter'}</p><p style={{whiteSpace:'pre-wrap'}}>{row.message||'Aucune précision supplémentaire.'}</p><small>Notification au restaurant : {row.notification_status==='sent'?'acceptée par le service email (livraison non vérifiée)':row.notification_status==='failed'?'échec d’envoi':'en attente'}</small>{row.notification_status!=='sent'&&<button style={{marginLeft:15}} disabled={busy===row.id} onClick={()=>change(row,{retry_email:true})}>Réessayer l’email</button>}<p><small>Référence : {row.id}. Demande d’information, réservation à confirmer séparément.</small></p></article>)}</div></main>;
}
