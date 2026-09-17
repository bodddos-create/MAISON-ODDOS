'use client'
import {useEffect} from 'react'
import {usePathname,useRouter} from 'next/navigation'
export default function InvoiceTabRouter(){
 const pathname=usePathname(),router=useRouter()
 useEffect(()=>{
  if(pathname!=='/')return
  const click=e=>{const b=e.target.closest('button');if(b&&b.textContent.trim()==='Factures'){e.preventDefault();e.stopPropagation();router.push('/factures')}}
  document.addEventListener('click',click,true)
  return()=>document.removeEventListener('click',click,true)
 },[pathname,router])
 return null
}
