'use client'
import {useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import {usePathname} from 'next/navigation'
const sb=createClient('https://ldwgsogeqreywbqulqyj.supabase.co','sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE')
export default function VatFloatingButton(){
 const pathname=usePathname()
 const [user,setUser]=useState(undefined)
 useEffect(()=>{let alive=true;sb.auth.getUser().then(({data})=>alive&&setUser(data?.user||null));const {data:{subscription}}=sb.auth.onAuthStateChange((_e,s)=>alive&&setUser(s?.user||null));return()=>{alive=false;subscription.unsubscribe()}},[])
 if(!user||pathname.startsWith('/reservation'))return null
 return <a href="/vat" aria-label="Ouvrir la saisie rapide" style={{position:'fixed',right:18,bottom:18,zIndex:1000,background:'#405944',color:'white',textDecoration:'none',fontWeight:800,padding:'12px 16px',borderRadius:14,boxShadow:'0 6px 20px rgba(0,0,0,.18)'}}>Saisie rapide</a>
}
