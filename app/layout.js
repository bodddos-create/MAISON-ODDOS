import './globals.css'
import InvoiceTabRouter from './InvoiceTabRouter'
import TTCDisplayEnhancer from './TTCDisplayEnhancer'
import PersonnelDailyCost from './PersonnelDailyCost'
import PersonnelManager from './PersonnelManager'
export const metadata={title:'Maison Oddos · Pilotage',description:'Pilotage des restaurants'}
export default function RootLayout({children}){return <html lang="fr"><body><InvoiceTabRouter/><TTCDisplayEnhancer/><PersonnelDailyCost/><PersonnelManager/>{children}<a href="/vat" aria-label="Ouvrir la saisie TVA" style={{position:'fixed',right:18,bottom:18,zIndex:1000,background:'#405944',color:'white',textDecoration:'none',fontWeight:800,padding:'12px 16px',borderRadius:14,boxShadow:'0 6px 20px rgba(0,0,0,.18)'}}>HT · TVA · TTC</a></body></html>