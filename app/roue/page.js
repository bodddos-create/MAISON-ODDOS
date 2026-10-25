"use client";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  prizes,
  consentText,
  startsAt,
  endsAt,
  parseCode,
  canRedeem,
} from "../../lib/roue-config";
import "./roue.css";
import SlotMachine from "./SlotMachine";
export default function Roue({ demo = false }) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [consent, setConsent] = useState(false),
    [rules, setRules] = useState(false),
    [busy, setBusy] = useState(false),
    [ticket, setTicket] = useState(""),
    [result, setResult] = useState(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [details, setDetails] = useState(false),
    [spinOutcome, setSpinOutcome] = useState(null),
    [rolling, setRolling] = useState(false),
    [playsLeft, setPlaysLeft] = useState(null),
    [ready, setReady] = useState(false),
    [demoChoice, setDemoChoice] = useState("formule29");
  const claiming = useRef(false);
  useEffect(() => {
    setReady(true);
    if (demo) return;
    const params = new URLSearchParams(window.location.hash.slice(1)),
      t = params.get("ticket"),
      code = parseCode(params.get("bon"));
    if (t && /^[a-f0-9]{64}$/.test(t)) setTicket(t);
    if (code) {
      setBusy(true);
      fetch("/api/roue/bon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          setResult(d);
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
  }, [demo]);
  useEffect(() => {
    if (!demo && ticket && !claiming.current) {
      claiming.current = true;
      void claim(ticket);
    }
  }, [demo, ticket]);
  const now = new Date(),
    open =
      ready && (demo || (now >= new Date(startsAt) && now <= new Date(endsAt)));
  async function api(path, body) {
    const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      d = await r.json();
    if (!r.ok) throw Error(d.error || "Service indisponible.");
    return d;
  }
  async function requestTicket(e) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const p = prizes.find((p) => p.id === spinOutcome.prize);
        setResult({
          code: "DEMO-ESSAI-" + Date.now().toString(16).toUpperCase(),
          prize: p.id,
          label: p.label,
          expiresAt: "2026-11-30T22:59:59.999Z",
          demo: true,
        });
        return;
      }
      const d = await api("/api/roue/demande", {
        name: String(fields.get("name") || "").trim(),
        email: String(fields.get("email") || "").trim(),
        consent: fields.get("newsletter") === "on",
        rules: fields.get("rules") === "on",
        adult: fields.get("rules") === "on",
        winTicket: spinOutcome?.winTicket,
        website: "",
      });
      setMessage(d.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function claim(verifiedTicket = ticket) {
    setBusy(true);
    setError("");
    try {
      const d = await api("/api/roue/jouer", { ticket: verifiedTicket });
      setResult(d);
      setBusy(false);
      window.history.replaceState(null, "", `/jeu#bon=${d.code}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function draw() {
    setBusy(true);
    setRolling(true);
    setError("");
    setSpinOutcome(null);
    try {
      const d = demo
        ? {
            win: demoChoice !== "loss",
            prize: demoChoice === "loss" ? null : demoChoice,
            winTicket: "demo-only",
          }
        : await api("/api/roue/tirage", { rules, adult: rules });
      if (!demo && Number.isInteger(d.playsLeft)) setPlaysLeft(d.playsLeft);
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.setTimeout(
        () => {
          setSpinOutcome(d);
          setRolling(false);
          setBusy(false);
        },
        reduced ? 50 : 3500,
      );
    } catch (e) {
      setError(e.message);
      setRolling(false);
      setBusy(false);
    }
  }

  return (
    <div className="wheel-app">
      {demo && (
        <div
          className="demo-banner"
          style={{
            background: "#293d31",
            color: "#fff",
            padding: "14px 20px",
            textAlign: "center",
            font: "12px/1.8 Arial,sans-serif",
          }}
        >
          MODE ESSAI · Aucun cadeau réel attribué · Aucun e-mail envoyé · Aucune
          donnée enregistrée
        </div>
      )}
      <header>
        <a href="https://www.lamaisonduparc-salles.fr/" className="wordmark">
          LA MAISON DU PARC<small>UNE ADRESSE MAISON ODDOS</small>
        </a>
        <nav>
          <a href="https://www.lamaisonduparc-salles.fr/">
            Retour au restaurant
          </a>
          <button onClick={() => setDetails(true)}>Le principe du jeu</button>
        </nav>
      </header>
      <main>
        {demo && (
          <div
            style={{
              maxWidth: 1100,
              margin: "24px auto 0",
              padding: "0 24px",
              font: "13px/1.8 Arial,sans-serif",
            }}
          >
            <label>
              Prochain essai :{" "}
              <select
                aria-label="Résultat du prochain essai"
                value={demoChoice}
                disabled={busy}
                onChange={(e) => setDemoChoice(e.target.value)}
              >
                <option value="loss">Partie perdante</option>
                {prizes.map((p) => (
                  <option value={p.id} key={p.id}>
                    Gain : {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              style={{ marginLeft: 16 }}
              disabled={busy}
              onClick={() => {
                setResult(null);
                setSpinOutcome(null);
                setMessage("");
                setError("");
                setEmail("");
                setName("");
              }}
            >
              Recommencer l’essai
            </button>
          </div>
        )}
        <section className="experience">
          <div className="editorial">
            <div className="eyebrow">
              UNE ATTENTION POUR VOTRE PROCHAINE VISITE
            </div>
            <h1>
              Trois rouleaux.
              <br />
              <i>Une belle surprise.</i>
            </h1>
            <p className="intro">
              Les plus beaux moments commencent souvent par une petite surprise.
              La Maison du Parc vous invite à tenter votre chance parmi 75 lots.
            </p>
            <div className="restaurants">
              <div className="restaurant selected">
                <img
                  src="https://primary.jwwb.nl/public/z/w/i/temp-grvnpodbsnsoizesmjof/maquette-exterieur-standard.png"
                  alt="La Maison du Parc à Salles"
                />
                <span>
                  <small>SALLES · PARC DU CHÂTEAU</small>
                  <strong>La Maison du Parc</strong>
                </span>
              </div>
            </div>
            <div className="steps">
              <span>
                <b>01</b> Lancez la machine
              </span>
              <span>
                <b>02</b> Récupérez votre gain
              </span>
              <span>
                <b>03</b> Présentez votre cadeau
              </span>
            </div>
            <div className="editorial-note">
              <p>
                <strong>
                  Jouez dès maintenant et jusqu’au 27 novembre 2026 inclus.
                </strong>
                <br />
                15 formules et 60 boissons à gagner.
                <br />
                Bons utilisables du mardi 27 octobre au 30 novembre 2026 inclus.
                <br />
                Dans la limite des 75 lots disponibles.
              </p>
            </div>
          </div>
          <div className="game-panel">
            <div className="game-title">
              <span>LA MACHINE GOURMANDE</span>
              <span className="edition">JUSQU’AU 27 NOV. 2026</span>
            </div>
            <SlotMachine
              busy={rolling}
              prize={
                result?.prize || (spinOutcome?.win ? spinOutcome.prize : null)
              }
              lost={spinOutcome?.win === false}
            />
            {result ? (
              <section className="result" aria-live="polite">
                <div className="result-tag">
                  {demo
                    ? "BON DE DÉMONSTRATION · SANS VALEUR COMMERCIALE"
                    : "VOTRE CADEAU À LA MAISON DU PARC"}
                </div>
                <h2>{result.label}</h2>
                <div className="coupon">
                  <span>VOTRE CODE PERSONNEL</span>
                  <strong style={{ fontSize: 14, overflowWrap: "anywhere" }}>
                    {result.code}
                  </strong>
                  <div
                    style={{
                      display: "inline-block",
                      background: "white",
                      padding: 12,
                      margin: 14,
                    }}
                  >
                    <QRCodeSVG
                      value={result.code}
                      size={180}
                      level="M"
                      marginSize={4}
                      title="QR code du bon cadeau"
                    />
                  </div>
                  <small>
                    Utilisable du mardi 27 octobre au 30 novembre 2026 inclus.
                  </small>
                </div>
                <p>
                  {result.used
                    ? "Ce bon a déjà été utilisé."
                    : new Date(result.expiresAt) < new Date()
                      ? "Ce bon a expiré."
                      : !canRedeem()
                        ? "Conservez votre bon : il sera utilisable à partir du mardi 27 octobre 2026."
                        : "À présenter à l’équipe avant la remise du cadeau. Utilisable une seule fois."}
                </p>
                {result.emailSent === false && (
                  <p role="alert">
                    Votre bon est enregistré, mais son e-mail n’a pas pu être
                    envoyé. Conservez cette page ou imprimez le bon.
                  </p>
                )}
                {result.emailSent === true && (
                  <p>
                    Votre bon a été confié au service d’envoi par e-mail.
                    Vérifiez aussi vos courriers indésirables.
                  </p>
                )}
                <button className="spin" onClick={() => window.print()}>
                  Imprimer ou enregistrer mon bon
                </button>
                <a
                  className="follow-link"
                  href="https://www.lamaisonduparc-salles.fr/"
                >
                  Retour au site du restaurant
                </a>
              </section>
            ) : ticket ? (
              <section className="entry-form">
                <h2>Votre bon vous attend.</h2>
                <p>
                  Votre e-mail est confirmé. Votre bon et son QR code se préparent automatiquement.
                </p>
                <button className="spin" disabled={busy} onClick={() => claim()}>
                  {busy ? "Préparation du bon…" : "Réessayer d’afficher mon bon"}
                </button>
              </section>
            ) : message ? (
              <section className="entry-form" aria-live="polite">
                <h2>Dernière étape : ouvrez votre e-mail.</h2>
                <p>{message}</p>
                <p>
                  Le lot est réservé 15 minutes après le gain. L’inscription à
                  la newsletter reste facultative.
                </p>
                <button className="spin" onClick={() => setMessage("")}>
                  Corriger mon adresse e-mail
                </button>
              </section>
            ) : spinOutcome?.win ? (
              <form className="entry-form" onSubmit={requestTicket}>
                <div className="form-heading">
                  <h2>Vous avez gagné ! Où envoyer votre cadeau ?</h2>
                  <p>
                    <strong>
                      {prizes.find((p) => p.id === spinOutcome.prize)?.label}
                    </strong>
                  </p>
                  <p>
                    {demo
                      ? "Utilisez une adresse fictive, par exemple test@example.com. Aucun e-mail ne sera envoyé."
                      : "Indiquez votre e-mail, puis ouvrez le lien reçu : votre bon avec son QR code apparaîtra automatiquement."}{" "}
                    {!demo && (
                      <>
                        Le cadeau est réservé pendant 15 minutes ; confirmez
                        votre adresse grâce au lien reçu.
                      </>
                    )}
                  </p>
                </div>
                <div className="fields">
                  <label>
                    Votre prénom
                    <input
                      required
                      maxLength={70}
                      name="name"
                      autoComplete="given-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Votre adresse e-mail
                    <input
                      required
                      type="email"
                      maxLength={254}
                      name="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                </div>
                <div className="trap" aria-hidden="true">
                  <input type="hidden" name="website" value="" readOnly />
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    name="rules"
                    required
                    checked={rules}
                    onChange={(e) => setRules(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    J’ai 18 ans ou plus et j’accepte les{" "}
                    <button type="button" onClick={() => setDetails(true)}>
                      conditions du jeu
                    </button>
                    .
                  </span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="newsletter"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    {consentText} <em>Facultatif.</em>
                  </span>
                </label>
                <button className="spin" disabled={busy || !open}>
                  {busy ? "Envoi en cours…" : "Recevoir le lien de mon cadeau"}
                </button>
                <p className="fine">
                  Participation gratuite · Newsletter facultative
                </p>
              </form>
            ) : (
              <section className="entry-form">
                <h2>
                  {spinOutcome?.win === false
                    ? "Ce sera peut-être au prochain tour…"
                    : "Tentez votre chance."}
                </h2>
                <p>
                  {spinOutcome?.win === false
                    ? "Cette partie n’est pas gagnante. Vous pouvez rejouer gratuitement dans la limite de 10 parties par jour."
                    : "Jouez gratuitement, jusqu’à 10 parties par jour et par navigateur. Votre e-mail sera demandé uniquement si vous gagnez un cadeau."}
                </p>
                {!demo && playsLeft !== null && <p role="status">{playsLeft} partie{playsLeft > 1 ? "s" : ""} restante{playsLeft > 1 ? "s" : ""} aujourd’hui sur ce navigateur.</p>}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={rules}
                    onChange={(e) => setRules(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    J’ai 18 ans ou plus et j’accepte les{" "}
                    <button type="button" onClick={() => setDetails(true)}>
                      conditions du jeu
                    </button>
                    .
                  </span>
                </label>
                <button
                  className="spin"
                  disabled={busy || !open || !rules}
                  onClick={draw}
                >
                  {rolling
                    ? "Les rouleaux tournent…"
                    : spinOutcome?.win === false
                      ? "Je rejoue"
                      : "Je lance la machine"}
                </button>
                <p className="fine">
                  Sans mise d’argent · Sans achat · E-mail uniquement en cas de
                  gain
                </p>
              </section>
            )}
            {!result && ready && !open && (
              <p role="status" className="fine">
                {now < new Date(startsAt)
                  ? "Le jeu ouvre prochainement."
                  : "Les participations sont closes. Vos bons restent valables jusqu’au 30 novembre inclus."}
              </p>
            )}
            {(spinOutcome !== null || result || message || ticket) && (
              <aside aria-labelledby="community-title" style={{marginTop:28,padding:"24px 20px",borderTop:"1px solid #c8b791",background:"#f3efe6",textAlign:"center"}}>
                <h2 id="community-title" style={{fontSize:25}}>Gardons le plaisir de nous retrouver !</h2>
                <p>Suivez La Maison du Parc pour découvrir nos menus, nos soirées et les prochaines surprises.</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:12,justifyContent:"center",margin:"18px 0"}}>
                  <a href="https://www.facebook.com/profile.php?id=61590291296284" target="_blank" rel="noopener noreferrer" style={{display:"inline-block",padding:"14px 20px",background:"#344131",color:"#fff",textDecoration:"none",borderRadius:4}}>Suivre sur Facebook</a>
                  <a href="https://www.instagram.com/lamaisonduparcsalles/" target="_blank" rel="noopener noreferrer" style={{display:"inline-block",padding:"14px 20px",background:"#344131",color:"#fff",textDecoration:"none",borderRadius:4}}>Suivre sur Instagram</a>
                </div>
                <p className="fine">Abonnement facultatif, sans effet sur vos chances de gagner ou sur votre cadeau.</p>
              </aside>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
        <section className="gifts">
          <div>
            <p className="eyebrow">
              LES PETITES ATTENTIONS FONT LES BELLES VISITES
            </p>
            <h2>Six façons de se faire plaisir.</h2>
          </div>
          <div className="gift-list">
            {prizes.map((p) => (
              <div key={p.id}>
                <span style={{ background: p.color }}>✧</span>
                <p>
                  {p.label}
                  <small>{p.count} lots prévus / 75</small>
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer>
        <a className="wordmark" href="https://www.lamaisonduparc-salles.fr/">
          LA MAISON DU PARC<small>PARC DU CHÂTEAU · SALLES</small>
        </a>
        <button onClick={() => setDetails(true)}>
          Conditions et données personnelles
        </button>
        <p>
          L’abus d’alcool est dangereux pour la santé, à consommer avec
          modération.
        </p>
      </footer>
      {details && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules"
          >
            <button
              className="close"
              autoFocus
              onClick={() => setDetails(false)}
            >
              Fermer ×
            </button>
            <h2 id="rules">
              Le plaisir de jouer.
              <br />
              Des conditions claires.
            </h2>
            <p>
              Jeu gratuit proposé par La Maison du Parc, Parc du Château, 35 rue
              du Château, 33770 Salles. Contact :
              contact@lamaisonduparc-salles.fr.
            </p>
            <p>
              Participation réservée aux personnes majeures, du 25 octobre 2026
              à 00 h au 27 novembre 2026 à 23 h 59, heure de Paris, dans la
              limite de 75 cadeaux. Les parties gratuites peuvent être rejouées dans la limite de 10 parties par jour et par navigateur, avec remise à zéro à minuit, heure de Paris. Un cookie technique signé, conservé 30 jours, permet de faire respecter cette limite sans demander votre e-mail avant le gain.
              Une chance sur cinq de gagner, sous réserve des lots encore
              disponibles. Un seul cadeau par adresse e-mail vérifiée. Le lot
              est attribué aléatoirement côté serveur parmi le stock disponible.
              Trois symboles identiques sur la ligne centrale donnent droit à un
              seul lot de la catégorie affichée. Des symboles différents
              correspondent à une partie non gagnante. Un gain est réservé 15
              minutes pour renseigner et confirmer l’e-mail ; passé ce délai, le
              lot redevient disponible. Les trois rouleaux illustrent le lot
              attribué ; leur animation ne modifie pas le tirage. Aucune mise
              d’argent ni achat de jetons. Les probabilités évoluent avec le
              stock.
            </p>
            <p>
              Lots : 5 formules à 19 €, 5 formules à 29 €, 5 formules à 39 €, 20
              bières Grolsch 25 cl, 20 boissons sans alcool et 20 cocktails.
              Bons utilisables à La Maison du Parc du mardi 27 octobre au 30
              novembre 2026 inclus, selon ses horaires d’ouverture. Chaque code
              est utilisable une seule fois.
            </p>
            <p>
              Le prénom, l’e-mail, le gain, les dates et la preuve de
              consentement sont enregistrés pour gérer le jeu et les bons. Une
              empreinte technique de connexion sert à limiter les abus. Le
              traitement et les e-mails du jeu utilisent les services de
              l’application Maison Oddos. Votre accord newsletter est facultatif
              et séparé ; seuls les contacts consentants sont destinés à
              l’export vers Wix.
            </p>
            <p>
              Pour exercer vos droits ou retirer votre consentement, écrivez à
              contact@lamaisonduparc-salles.fr. Les données du jeu sont
              destinées à être supprimées ou anonymisées au plus tard le 28
              février 2027, sauf obligation de conservation ou accord newsletter
              maintenu.
            </p>
            <p>
              Cette opération n’est ni organisée, ni parrainée, ni gérée par
              Facebook ou Instagram. Aucun partage ou marquage d’amis n’est
              demandé.
            </p>
            <button className="spin" onClick={() => setDetails(false)}>
              J’ai compris
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
