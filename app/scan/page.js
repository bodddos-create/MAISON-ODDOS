'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ldwgsogeqreywbqulqyj.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_placeholder'
)

export default function ScanPage() {
  const [type, setType] = useState('invoice')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [message, setMessage] = useState('')

  function chooseFile(e) {
    const selected = e.target.files?.[0]
    setFile(selected || null)
    setMessage('')
    if (preview) URL.revokeObjectURL(preview)
    setPreview(selected ? URL.createObjectURL(selected) : '')
  }

  async function prepare() {
    if (!file) return setMessage('Prenez une photo ou choisissez un document.')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return setMessage('Connectez-vous d’abord à Maison Oddos.')
    setMessage('Document prêt. La lecture automatique sera activée à l’étape suivante.')
  }

  return (
    <main style={{minHeight:'100vh',background:'#f4f1e9',padding:'24px',fontFamily:'Arial,sans-serif',color:'#24372d'}}>
      <div style={{maxWidth:680,margin:'0 auto'}}>
        <a href="/" style={{color:'#52684e',textDecoration:'none'}}>← Retour au pilotage</a>
        <h1 style={{fontFamily:'Georgia,serif',fontSize:34,marginBottom:4}}>Scanner un document</h1>
        <p style={{marginTop:0,color:'#68736b'}}>Maison Oddos · saisie rapide depuis le téléphone</p>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,margin:'24px 0'}}>
          <button onClick={()=>setType('invoice')} style={button(type==='invoice')}>Facture fournisseur</button>
          <button onClick={()=>setType('z')} style={button(type==='z')}>Z de caisse</button>
        </div>

        <section style={{background:'white',borderRadius:18,padding:22,boxShadow:'0 8px 28px rgba(0,0,0,.08)'}}>
          <h2 style={{marginTop:0}}>{type==='invoice' ? 'Photographier une facture' : 'Photographier le Z de caisse'}</h2>
          <p>{type==='invoice'
            ? 'L’objectif est de reconnaître automatiquement le restaurant, le fournisseur, la catégorie, la date et les montants.'
            : 'L’objectif est de reconnaître automatiquement le restaurant, la date, le chiffre d’affaires et le nombre de couverts.'}</p>

          <label style={{display:'block',border:'2px dashed #a6ad9d',borderRadius:14,padding:28,textAlign:'center',cursor:'pointer',margin:'20px 0'}}>
            <strong>📷 Prendre une photo</strong><br/>
            <span style={{fontSize:13,color:'#6f766f'}}>ou sélectionner une image / un PDF</span>
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={chooseFile} style={{display:'none'}} />
          </label>

          {file && <div style={{background:'#f7f6f1',padding:12,borderRadius:10,marginBottom:14}}><strong>{file.name}</strong><br/><small>{Math.round(file.size/1024)} Ko</small></div>}
          {preview && file?.type?.startsWith('image/') && <img src={preview} alt="Aperçu" style={{width:'100%',maxHeight:420,objectFit:'contain',borderRadius:12,marginBottom:14}} />}

          <button onClick={prepare} style={{...button(true),width:'100%',padding:14}}>Analyser le document</button>
          {message && <p style={{background:'#eef2e9',padding:12,borderRadius:10,marginBottom:0}}>{message}</p>}
        </section>

        <section style={{marginTop:18,padding:18,border:'1px solid #d8d8cf',borderRadius:14}}>
          <strong>Après analyse</strong>
          <p style={{marginBottom:0}}>Les informations détectées seront affichées pour vérification avant leur enregistrement définitif. Rien ne sera validé sans contrôle.</p>
        </section>
      </div>
    </main>
  )
}

function button(active) {
  return {
    border:0,borderRadius:12,padding:'12px 10px',fontWeight:700,cursor:'pointer',
    background:active?'#405944':'#dedfd7',color:active?'white':'#344238'
  }
}
