"use client";
import { prizes, reelIds } from "../../lib/roue-config";
const symbols = [
  { id: "formule19", top: "FORMULE", main: "19", bottom: "EUROS" },
  { id: "formule29", top: "FORMULE", main: "29", bottom: "EUROS" },
  { id: "formule39", top: "FORMULE", main: "39", bottom: "EUROS" },
  { id: "biere", top: "GROLSCH", main: "♧", bottom: "25 CL" },
  { id: "sansalcool", top: "UNE PAUSE", main: "◇", bottom: "SANS ALCOOL" },
  { id: "cocktail", top: "UN INSTANT", main: "♢", bottom: "COCKTAIL" },
];
function Symbol({ symbol }) {
  return (
    <div className="slot-symbol">
      <small>{symbol.top}</small>
      <strong>{symbol.main}</strong>
      <small>{symbol.bottom}</small>
    </div>
  );
}
export default function SlotMachine({ busy, prize, lost }) {
  const won = symbols.find((s) => s.id === prize);
  return (
    <div
      className={
        "slot-machine " + (busy ? "is-spinning" : "") + (won ? " has-won" : "")
      }
      role="img"
      aria-label={
        busy
          ? "Les trois rouleaux tournent"
          : won
            ? `Trois symboles identiques : ${prizes.find((p) => p.id === prize)?.label}`
            : lost
              ? "Partie non gagnante, trois symboles différents"
              : "La machine gourmande à trois rouleaux"
      }
    >
      <div className="slot-beacon" />
      <div className="slot-cabinet">
        <div className="slot-marquee">
          <span>LA MAISON DU PARC</span>
          <strong>
            La Machine
            <br />
            <i>Gourmande</i>
          </strong>
          <span>75 INSTANTS À SAVOURER</span>
        </div>
        <div className="slot-trim">
          ✦ <span>UNE ADRESSE. MILLE PLAISIRS.</span> ✦
        </div>
        <div className="slot-windows">
          {[0, 1, 2].map((i) => (
            <div className="slot-window" key={i}>
              <div className="slot-payline" />
              {busy ? (
                <div
                  className="slot-strip"
                  style={{ "--reel-speed": `${0.48 + i * 0.11}s` }}
                >
                  {[...symbols, ...symbols].map((s, k) => (
                    <Symbol key={k} symbol={s} />
                  ))}
                </div>
              ) : (
                <Symbol
                  symbol={symbols.find((s) => s.id === reelIds(prize)[i])}
                />
              )}
            </div>
          ))}
        </div>
        <div className="slot-outcome">
          {busy
            ? "VOTRE SURPRISE SE PRÉPARE…"
            : won
              ? "TROIS SYMBOLES · VOTRE CADEAU EST GAGNÉ"
              : lost
                ? "UN AUTRE TOUR ? TENTEZ VOTRE CHANCE"
                : "VOTRE PROCHAIN MOMENT DE PLAISIR"}
        </div>
        <div className="slot-plaque">
          <span>MO</span>
          <div>
            MAISON ODDOS<small>LE PLAISIR DE RECEVOIR</small>
          </div>
        </div>
        <div className="slot-dispenser" />
      </div>
      <div className="slot-lever" aria-hidden="true">
        <span />
        <i />
      </div>
    </div>
  );
}
