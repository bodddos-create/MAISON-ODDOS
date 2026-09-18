import './globals.css'
import InvoiceTabRouter from './InvoiceTabRouter'
import TTCDisplayEnhancer from './TTCDisplayEnhancer'
import PersonnelDailyCost from './PersonnelDailyCost'
import PersonnelManager from './PersonnelManager'
import VatFloatingButton from './VatFloatingButton'
import DirectionFinanceChart from './DirectionFinanceChart'
import DirectionVatSummary from './DirectionVatSummary'
import OpeningCalendar from './OpeningCalendar'
export const metadata={title:'Maison Oddos · Pilotage',description:'Pilotage des restaurants'}
export default function RootLayout({children}){return <html lang="fr"><body><InvoiceTabRouter/><TTCDisplayEnhancer/><PersonnelDailyCost/><PersonnelManager/><DirectionFinanceChart/><DirectionVatSummary/><OpeningCalendar/>{children}<VatFloatingButton/></body></html>}
