"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { prizes, parseCode, canRedeem } from "../../lib/roue-config";
import BonScanner from "./BonScanner";
import { gameStatistics, parisDay } from "../../lib/game-statistics";
import { startsAt } from "../../lib/roue-config";
import "../roue/roue.css";
const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);
const statusOf = (e) =>
  e.used_at
    ? "used"
    : new Date(e.expires_at) <= new Date()
      ? "expired"
      : "available";
const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export default function Bons() {
  const [daily, setDaily] = useState([]),
    [from, setFrom] = useState(parisDay(startsAt)),
    [to, setTo] = useState(parisDay()),
    [entries, setEntries] = useState([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [token, setToken] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [scanning, setScanning] = useState(false);
  const load = useCallback(async (accessToken) => {
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/roue/gestion", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setEntries(d.entries);
      setDaily(d.daily || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const t = data.session?.access_token || "";
      setToken(t);
      if (t) void load(t);
      else setLoading(false);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (alive) {
        setToken(session?.access_token || "");
        if (session?.access_token) void load(session.access_token);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [load]);
  useEffect(() => {
    if (!token) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load(token);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, token]);
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setPassword("");
    setBusy(false);
    if (error) setError("Adresse e-mail ou mot de passe incorrect.");
  }
  const closeScanner = useCallback(() => setScanning(false), []);
  const scanned = useCallback(
    (code) => {
      const valid = parseCode(code);
      setScanning(false);
      if (!valid) {
        setError("Code invalide.");
        return;
      }
      setSearch(valid);
      setStatus("all");
      setNotice(
        "Code lu. Vérifiez le statut avant de confirmer la remise du cadeau.",
      );
      void load(token);
    },
    [load, token],
  );
  async function action(entry, kind) {
    if (busy) return;
    if (
      kind === "redeem" &&
      !window.confirm(
        `${entry.name}\n${prizes.find((p) => p.id === entry.prize)?.label}\nConfirmer la remise de ce cadeau ? Le code sera définitivement marqué utilisé.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await sb.auth.getSession();
      const t = data.session?.access_token;
      if (!t) throw Error("Reconnectez-vous.");
      const r = await fetch("/api/roue/gestion", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: entry.id, action: kind }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (kind === "redeem" && !d.updated)
        throw Error("Ce bon est déjà utilisé ou expiré.");
      setNotice(
        kind === "redeem"
          ? "Cadeau validé. Ce code ne peut plus être utilisé."
          : "Le bon a été confié au service d’envoi.",
      );
      await load(t);
    } catch (e) {
      await load(token);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function exportNewsletter() {
    const rows = [
      [
        "Prénom",
        "Email",
        "Consentement newsletter",
        "Date du consentement",
        "Texte accepté",
        "Origine",
      ],
      ...entries
        .filter((e) => e.consent)
        .map((e) => [
          e.name,
          e.email,
          "Oui",
          e.created_at,
          e.consent_text,
          "Machine gourmande Maison du Parc 2026",
        ]),
    ];
    const safe = (value) =>
      '"' +
      (/^[=+@\-\t\r]/.test(value) ? "'" : "") +
      value.replaceAll('"', '""') +
      '"';
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(safe).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "newsletter-maison-du-parc-consentements.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const shown = entries.filter(
    (e) =>
      (status === "all" || statusOf(e) === status) &&
      normalize([e.name, e.email, e.code].join(" ")).includes(
        normalize(search),
      ),
  );
  const analysis = gameStatistics(daily, entries, from, to);
  const peak = Math.max(1, ...analysis.days.map(d => d.plays));
  return (
    <div className="wheel-app">
      <header>
        <a className="wordmark" href="/">
          MAISON ODDOS<small>GESTION DES BONS · LA MAISON DU PARC</small>
        </a>
        <nav>
          <a href="/">Pilotage Restaurant</a>
          <a href="/reservations">Réservations</a>
          <a href="/jeu">Voir le jeu</a>
        </nav>
      </header>
      <main className="dashboard">
        <p className="eyebrow">ESPACE RÉSERVÉ À L’ÉQUIPE AUTORISÉE</p>
        <h1>
          Les cadeaux.
          <br />
          <i>Le plaisir de recevoir.</i>
        </h1>
        {!token ? (
          <form className="entry-form" onSubmit={login}>
            <p>
              Utilisez votre compte équipe Maison Oddos. Seuls les responsables
              et les membres de l’équipe affectés à La Maison du Parc peuvent
              gérer les bons.
            </p>
            <label>
              Adresse e-mail
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="spin" disabled={busy}>
              {busy ? "Connexion…" : "Accéder aux bons cadeaux"}
            </button>
          </form>
        ) : (
          <>
            <section aria-labelledby="game-analysis-title">
              <h2 id="game-analysis-title">Statistiques du jeu</h2>
              <div className="tools">
                <label>Du<input type="date" value={from} min={parisDay(startsAt)} max={to} onChange={e => setFrom(e.target.value)} /></label>
                <label>Au<input type="date" value={to} min={from} max={parisDay()} onChange={e => setTo(e.target.value)} /></label>
                <button disabled={loading || busy} onClick={() => load(token)}>Actualiser les statistiques</button>
              </div>
              {from > to && <p role="alert">La date de début doit précéder la date de fin.</p>}
              <div className="stats">
                <div><strong>{analysis.plays}</strong><span>parties jouées</span></div>
                <div><strong>{analysis.wins}</strong><span>tirages gagnants</span></div>
                <div><strong>{analysis.claimed}</strong><span>gagnants avec e-mail vérifié</span></div>
                <div><strong>{analysis.used}</strong><span>cadeaux remis sur la période</span></div>
                <div><strong>{analysis.newsletter}</strong><span>accords newsletter parmi ces gagnants</span></div>
              </div>
              <p>Une personne peut jouer plusieurs fois. Ces chiffres comptent des parties, pas des visiteurs uniques. Un tirage gagnant ne devient un bon attribué qu’après vérification de l’e-mail. Dates en heure de Paris.</p>
              {loading ? <p>Actualisation des statistiques…</p> : <div className="table-wrap">
                <table aria-label="Évolution quotidienne du jeu">
                  <thead><tr><th>Date</th><th>Parties jouées</th><th>Tirages gagnants</th><th>Bons récupérés</th><th>Cadeaux remis</th></tr></thead>
                  <tbody>{analysis.days.map(d => <tr key={d.day}>
                    <td>{d.day.split('-').reverse().join('/')}</td>
                    <td><strong>{d.plays}</strong><div aria-hidden="true" style={{height:6,background:'#d8c6a3',width:`${100*d.plays/peak}%`,minWidth:d.plays ? 3 : 0,marginTop:5}} /></td>
                    <td>{d.wins}</td><td>{d.claimed}</td><td>{d.used}</td>
                  </tr>)}</tbody>
                </table>
                {!analysis.plays && <p>Aucune partie enregistrée sur cette période.</p>}
              </div>}
            </section>
            <h2>Stock et suivi des cadeaux — toute la campagne</h2>
            <div className="stats">
              <div>
                <strong>{entries.length}</strong>
                <span>cadeaux attribués</span>
              </div>
              <div>
                <strong>{entries.filter((e) => e.used_at).length}</strong>
                <span>cadeaux remis</span>
              </div>
              <div>
                <strong>{Math.max(0, 75 - entries.length)}</strong>
                <span>lots à gagner</span>
              </div>
              <div>
                <strong>{entries.filter((e) => e.consent).length}</strong>
                <span>accords newsletter</span>
              </div>
            </div>
            <p>Scannez le QR code du client, vérifiez son lot puis confirmez sa remise. Chaque bon est utilisable une seule fois ; le décompte se met à jour après validation.</p>
            <section className="table-wrap" aria-label="Stock des lots">
              <table>
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Initial</th>
                    <th>Attribués</th>
                    <th>Remis</th>
                    <th>À remettre</th>
                    <th>À gagner</th>
                  </tr>
                </thead>
                <tbody>
                  {prizes.map((p) => {
                    const selected = entries.filter((e) => e.prize === p.id);
                    return (
                      <tr key={p.id}>
                        <td>{p.label}</td>
                        <td>{p.count}</td>
                        <td>{selected.length}</td>
                        <td>{selected.filter((e) => e.used_at).length}</td>
                        <td>{selected.filter((e) => statusOf(e) === "available").length}</td>
                        <td>{Math.max(0, p.count - selected.length)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <div className="tools">
              <button disabled={busy} onClick={() => setScanning(true)}>
                Scanner un QR code avec le téléphone
              </button>
              <label>
                Rechercher un bon
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Code, prénom ou e-mail"
                />
              </label>
              <label>
                Statut
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Tous</option>
                  <option value="available">Disponibles</option>
                  <option value="used">Utilisés</option>
                  <option value="expired">Expirés</option>
                </select>
              </label>
              <button disabled={loading || busy} onClick={() => load(token)}>
                Actualiser
              </button>
              <button
                disabled={!entries.some((e) => e.consent)}
                onClick={exportNewsletter}
              >
                Exporter les contacts consentants pour Wix
              </button>
            </div>
            {loading ? (
              <p>Chargement…</p>
            ) : !shown.length ? (
              <p>Aucun bon correspondant.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Participant",
                        "Lot",
                        "Code",
                        "Validité",
                        "E-mail",
                        "Statut",
                      ].map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.name}
                          <br />
                          {e.email}
                        </td>
                        <td>{prizes.find((p) => p.id === e.prize)?.label}</td>
                        <td>
                          <code style={{ overflowWrap: "anywhere" }}>
                            {e.code}
                          </code>
                        </td>
                        <td>
                          {new Date(e.expires_at).toLocaleDateString("fr-FR", {
                            timeZone: "Europe/Paris",
                          })}
                        </td>
                        <td>
                          {e.email_status === "sent"
                            ? "Envoyé"
                            : e.email_status === "failed"
                              ? "Échec de l’envoi"
                              : "En attente"}
                          {e.email_status !== "sent" && (
                            <button
                              disabled={busy}
                              onClick={() => action(e, "resend")}
                            >
                              Réessayer l’envoi
                            </button>
                          )}
                        </td>
                        <td>
                          {e.used_at ? (
                            `Utilisé le ${new Date(e.used_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`
                          ) : statusOf(e) === "expired" ? (
                            "Expiré"
                          ) : !canRedeem() ? (
                            "Utilisable à partir du mardi 27 octobre 2026"
                          ) : (
                            <button
                              disabled={busy}
                              onClick={() => action(e, "redeem")}
                            >
                              Valider le cadeau
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>
              Seuls les contacts ayant donné leur accord apparaissent dans
              l’export newsletter. Aucun contact n’est transmis automatiquement
              à Wix.
            </p>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {scanning && <BonScanner onCode={scanned} onClose={closeScanner} />}
      </main>
    </div>
  );
}
