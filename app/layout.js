import './globals.css'
import './reservation.css'
import AppShell from './AppShell'
export const metadata={title:'Maison Oddos · Pilotage',description:'Pilotage des restaurants'}
export default function RootLayout({children}){return <html lang="fr"><body><AppShell>{children}</AppShell></body></html>}
