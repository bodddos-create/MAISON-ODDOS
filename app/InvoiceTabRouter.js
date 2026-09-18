'use client'
import {useEffect} from 'react'
import {usePathname,useRouter} from 'next/navigation'
export default function InvoiceTabRouter(){
 const pathname=usePathname(),router=useRouter()
 useEffect(()=>{
  if(pathname!=='/')return
  const click=e=>{
   const b=e.target.closest('button')
   if(!b)return
   const text=b.textContent.trim()
   if(text==='Factures'){e.preventDefault();e.stopPropagation();router.push('/factures');return}
   if(text==='Facture'||text==='Z de caisse'){
    e.preventDefault();e.stopPropagation();router.push('/vat')
   }
  }
  document.addEventListener('click',click,true)
  return()=>document.removeEventListener('click',click,true)
 },[pathname,router])
 return null
}
