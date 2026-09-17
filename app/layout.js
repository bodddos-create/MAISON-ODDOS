import './globals.css'
import InvoiceTabRouter from './InvoiceTabRouter'
import TTCDisplayEnhancer from './TTCDisplayEnhancer'
import PersonnelDailyCost from './PersonnelDailyCost'
import PersonnelManager from './PersonnelManager'
import VatFloatingButton from './VatFloatingButton'
import DirectionFinanceChart from './DirectionFinanceChart'
export const metadata={title:'Maison Oddos · Pilotage',description:'Pilotage des restaurants'}
export default function RootLayout({children}){return <html lang="fr"><body><InvoiceTabRouter/><TTCDisplayEnhancer/><PersonnelDailyCost/><PersonnelManager/><DirectionFinanceChart/>{children}<VatFloatingButton/></body></html>}
