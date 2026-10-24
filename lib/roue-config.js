export const campaign = "parc-novembre-2026";
export const establishmentId = "55c6e880-aa0c-40d6-9065-b5315b1a602a";
export const startsAt = "2026-10-24T22:00:00.000Z";
export const redeemStartsAt = "2026-10-26T23:00:00.000Z";
export function canRedeem(now = new Date()) {
  return now >= new Date(redeemStartsAt);
}
export const endsAt = "2026-11-27T22:59:59.999Z";
export const expiresAt = "2026-11-30T22:59:59.999Z";
export const consentText =
  "Je souhaite recevoir par e-mail les actualités et offres de La Maison du Parc. Je pourrai me désabonner à tout moment.";
const lots = [
  {
    id: "formule19",
    label: "Une formule à 19 €",
    short: "Formule 19 €",
    count: 5,
    color: "#eee3cf",
  },
  {
    id: "formule29",
    label: "Une formule à 29 €",
    short: "Formule 29 €",
    count: 5,
    color: "#cfb584",
  },
  {
    id: "formule39",
    label: "Une formule à 39 €",
    short: "Formule 39 €",
    count: 5,
    color: "#bb8e40",
  },
  {
    id: "biere",
    label: "Une bière Grolsch 25 cl",
    short: "Grolsch 25 cl",
    count: 20,
    color: "#79745f",
  },
  {
    id: "sansalcool",
    label: "Une boisson sans alcool",
    short: "Sans alcool",
    count: 20,
    color: "#d8cbb4",
  },
  {
    id: "cocktail",
    label: "Un cocktail",
    short: "Cocktail",
    count: 20,
    color: "#333c34",
  },
];
let offset = 0;
export const prizes = lots.map((p) => {
  const start = (offset / 75) * 360;
  offset += p.count;
  return { ...p, start, end: (offset / 75) * 360 };
});
export function publicCoupon(row) {
  return {
    code: row.code,
    prize: row.prize,
    label: prizes.find((p) => p.id === row.prize)?.label || row.prize,
    availableFrom: redeemStartsAt,
    expiresAt: row.expires_at,
    used: !!row.used_at,
  };
}
export function parseCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return /^LMP-[A-F0-9]{32}$/.test(code) ? code : null;
}

export function reelIds(prize) {
  return prizes.some((p) => p.id === prize)
    ? [prize, prize, prize]
    : ["formule29", "sansalcool", "formule39"];
}
