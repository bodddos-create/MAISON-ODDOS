import WheelLayout, { metadata as baseMetadata } from "../roue/layout";
export const metadata = {
  ...baseMetadata,
  metadataBase: new URL("https://pilotage.oddos.eu"),
  openGraph: {
    title: "Jouez et gagnez — La Machine Gourmande",
    description: "75 cadeaux à gagner à La Maison du Parc à Salles. 3 symboles identiques = 1 cadeau. Jeu gratuit, sans achat, réservé aux majeurs.",
    url: "https://pilotage.oddos.eu/jeu",
    type: "website",
    images: [{ url: "https://pilotage.oddos.eu/jeu/opengraph-image", width: 1200, height: 630, alt: "La Machine Gourmande — Jouez et gagnez" }],
  },
  twitter: { card: "summary_large_image", title: "Jouez et gagnez — La Machine Gourmande", images: ["https://pilotage.oddos.eu/jeu/opengraph-image"] },
};
export default WheelLayout;
