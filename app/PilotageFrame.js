"use client";

const navigation = [
  { key: "direction", icon: "⌂", label: "Vue d’ensemble", href: "/" },
  { key: "personnel", icon: "♙", label: "Personnel", href: "/?tab=personnel" },
  { key: "factures", icon: "▤", label: "Factures & avoirs", href: "/?tab=factures" },
  { key: "historique", icon: "Z", label: "Z", href: "/?tab=historique" },
  { key: "evolution-ca", icon: "↗", label: "Évolution du CA", href: "/evolution-ca" },
  { key: "analyse-produits", icon: "◇", label: "Analyse produits", href: "/analyse-produits" },
  { key: "visites-sites", icon: "◫", label: "Visites site web", href: "/visites-sites" },
  { key: "reservations", icon: "◷", label: "Réservations", href: "/reservations" },
  { key: "demandes-groupes", icon: "◇", label: "Groupes & privatisation", href: "/demandes-groupes" },
  { key: "charges", icon: "€", label: "Charges", href: "/?tab=charges" },
  { key: "stocks", icon: "◫", label: "Stocks", href: "/?tab=stocks" },
  { key: "bons-cadeaux", icon: "□", label: "Bons cadeaux · Scan QR", href: "/bons-cadeaux" },
  { key: "saisie", icon: "＋", label: "Saisie manuelle", href: "/?tab=saisie" },
];

export default function PilotageFrame({
  current,
  title,
  subtitle,
  children,
  actions,
}) {
  return (
    <div className="appShell">
      <aside className="dashboardSidebar">
        <div className="sideBrand">
          <img src="/maison-oddos-logo.svg" alt="Maison Oddos Restaurants" />
          <small>Espace de pilotage</small>
        </div>

        <nav className="dashboard-tabs" aria-label="Rubriques de pilotage">
          {navigation.map((item) => (
            <a
              key={item.key}
              className={current === item.key ? "active" : ""}
              href={item.href}
            >
              <span className="navIcon">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebarFoot">
          <strong>Bruno Oddos</strong>
          <span>Direction Maison Oddos</span>
          <a href="/">Retour à l’accueil</a>
        </div>
      </aside>

      <main className="dashboardMain sectionDashboard">
        <header className="topbar sectionTopbar">
          <div>
            <div className="eyebrow">Maison Oddos · Pilotage</div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="topbarControls">{actions}</div>}
        </header>
        {children}
      </main>

      <nav className="mobileNav" aria-label="Navigation mobile">
        {navigation.slice(0, 5).map((item) => (
          <a
            key={item.key}
            className={current === item.key ? "active" : ""}
            href={item.href}
          >
            <span>{item.icon}</span>
            {item.key === "direction" ? "Accueil" : item.label.split(" ")[0]}
          </a>
        ))}
      </nav>
    </div>
  );
}
