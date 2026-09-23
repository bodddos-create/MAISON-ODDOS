"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);

const money = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const number = (value) =>
  Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;

export default function AnalyseProduitsPage() {
  const [access, setAccess] = useState({ loading: true, allowed: false });
  const [establishments, setEstablishments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [archivedDocuments, setArchivedDocuments] = useState([]);
  const [lines, setLines] = useState([]);
  const [selectedEstablishment, setSelectedEstablishment] = useState("");
  const [selectedRun, setSelectedRun] = useState("");
  const [selectedArchive, setSelectedArchive] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [file, setFile] = useState(null);
  const [includeComponents, setIncludeComponents] = useState(false);
  const [ranking, setRanking] = useState("quantity");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRuns = useCallback(async () => {
    const [
      { data: estRows, error: estError },
      { data: runRows, error: runError },
      { data: dailyRows, error: dailyError },
      { data: historyRows, error: historyError },
    ] = await Promise.all([
      sb.from("establishments").select("id,name").eq("active", true).order("name"),
      sb.from("product_analysis_runs")
        .select("id,establishment_id,period_start,period_end,source_filename,source_document_path,status,confidence,line_count,created_at")
        .order("created_at", { ascending: false }),
      sb.from("daily_sales")
        .select("id,establishment_id,business_date,z_document_name,z_document_path")
        .not("z_document_path", "is", null)
        .order("business_date", { ascending: false }),
      sb.from("historical_ca")
        .select("id,establishment_id,period_start,period_type,source_filename,source_document_path")
        .not("source_document_path", "is", null)
        .order("period_start", { ascending: false }),
    ]);
    if (estError || runError || dailyError || historyError) {
      throw estError || runError || dailyError || historyError;
    }

    const analyzedPaths = new Set((runRows || []).map((run) => run.source_document_path).filter(Boolean));
    const seenPaths = new Set();
    const documents = [];

    (dailyRows || []).forEach((row) => {
      if (!row.z_document_path || seenPaths.has(row.z_document_path)) return;
      seenPaths.add(row.z_document_path);
      documents.push({
        value: `daily:${row.id}`,
        establishment_id: row.establishment_id,
        date: row.business_date,
        filename: row.z_document_name || "Rapport Z",
        path: row.z_document_path,
        kind: "Journalier",
        analyzed: analyzedPaths.has(row.z_document_path),
      });
    });

    (historyRows || []).forEach((row) => {
      if (!row.source_document_path || seenPaths.has(row.source_document_path)) return;
      seenPaths.add(row.source_document_path);
      documents.push({
        value: `history:${row.id}`,
        establishment_id: row.establishment_id,
        date: row.period_start,
        filename: row.source_filename || "Rapport Z historique",
        path: row.source_document_path,
        kind: row.period_type === "year" ? "Annuel" : row.period_type === "month" ? "Mensuel" : "Historique",
        analyzed: analyzedPaths.has(row.source_document_path),
      });
    });

    documents.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    setEstablishments(estRows || []);
    setRuns(runRows || []);
    setArchivedDocuments(documents);
    setSelectedEstablishment((current) => current || estRows?.[0]?.id || "");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await sb.auth.getUser();
      const user = data?.user;
      if (!user) {
        if (active) setAccess({ loading: false, allowed: false });
        return;
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const allowed = ["direction", "administratif"].includes(profile?.role);
      if (!active) return;
      setAccess({ loading: false, allowed });
      if (allowed) {
        try { await loadRuns(); } catch (loadError) {
          if (active) setError(loadError.message || "Chargement impossible.");
        }
      }
    })();
    return () => { active = false; };
  }, [loadRuns]);

  const availableRuns = useMemo(
    () => runs.filter((run) => run.establishment_id === selectedEstablishment),
    [runs, selectedEstablishment],
  );
  const availableDocuments = useMemo(
    () => archivedDocuments.filter((document) => document.establishment_id === selectedEstablishment),
    [archivedDocuments, selectedEstablishment],
  );

  useEffect(() => {
    if (!availableRuns.some((run) => run.id === selectedRun)) {
      setSelectedRun(availableRuns[0]?.id || "");
    }
  }, [availableRuns, selectedRun]);

  useEffect(() => {
    if (!availableDocuments.some((document) => document.value === selectedArchive)) {
      setSelectedArchive(availableDocuments[0]?.value || "");
    }
  }, [availableDocuments, selectedArchive]);

  useEffect(() => {
    let active = true;
    if (!selectedRun) {
      setLines([]);
      return () => { active = false; };
    }
    setError("");
    sb.from("product_sales_lines")
      .select("id,analysis_id,raw_label,normalized_label,category,sale_type,quantity,unit_price_ttc,sales_ttc,discounts_ttc,offered_quantity,cancelled_quantity,confidence")
      .eq("analysis_id", selectedRun)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(queryError.message);
        else setLines(data || []);
      });
    return () => { active = false; };
  }, [selectedRun]);

  const report = useMemo(() => {
    const grouped = new Map();
    lines
      .filter((line) => includeComponents || line.sale_type !== "component")
      .forEach((line) => {
        const key = line.normalized_label || line.raw_label;
        const current = grouped.get(key) || {
          label: line.raw_label,
          category: line.category,
          saleType: line.sale_type,
          quantity: 0,
          sales: 0,
          hasSales: false,
          discounts: 0,
          offered: 0,
          cancelled: 0,
        };
        current.quantity += Number(line.quantity || 0);
        if (line.sales_ttc != null) {
          current.sales += Number(line.sales_ttc || 0);
          current.hasSales = true;
        }
        current.discounts += Number(line.discounts_ttc || 0);
        current.offered += Number(line.offered_quantity || 0);
        current.cancelled += Number(line.cancelled_quantity || 0);
        grouped.set(key, current);
      });
    const products = [...grouped.values()];
    const totalQuantity = products.reduce((sum, item) => sum + item.quantity, 0);
    const totalSales = products.reduce((sum, item) => sum + item.sales, 0);
    const sorted = [...products].sort((a, b) =>
      ranking === "sales" ? b.sales - a.sales : b.quantity - a.quantity,
    );
    const byQuantity = [...products].sort((a, b) => b.quantity - a.quantity);
    const bySales = [...products].sort((a, b) => b.sales - a.sales);
    const formulaQuantity = products
      .filter((item) => item.category === "Formule" || item.saleType === "formula")
      .reduce((sum, item) => sum + item.quantity, 0);
    const threshold = (byQuantity[0]?.quantity || 0) * 0.15;
    const lowSellers = products.filter((item) => item.quantity > 0 && item.quantity <= threshold).length;
    return {
      products: sorted,
      totalQuantity,
      totalSales,
      topQuantity: byQuantity[0] || null,
      topSales: bySales[0]?.sales > 0 ? bySales[0] : null,
      formulaShare: totalQuantity ? (formulaQuantity / totalQuantity) * 100 : 0,
      lowSellers,
    };
  }, [lines, includeComponents, ranking]);

  async function analyzeArchived() {
    setError("");
    setMessage("");
    if (!selectedArchive) {
      setError("Aucun Z archivé n’est disponible pour ce restaurant.");
      return;
    }
    setBusy(true);
    try {
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Votre session a expiré.");
      const form = new FormData();
      form.append("existing_source", selectedArchive);
      const response = await fetch("/api/product-analysis", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Analyse impossible.");
      await loadRuns();
      setSelectedRun(body.analysis_id);
      setMessage(
        body.already_analyzed
          ? "Ce Z avait déjà été analysé : son résultat est affiché."
          : `${body.line_count} lignes produits lues depuis le Z archivé.`,
      );
    } catch (analysisError) {
      setError(analysisError.message || "Analyse impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!file || !selectedEstablishment) {
      setError("Choisissez le restaurant et le Z détaillé.");
      return;
    }
    setBusy(true);
    try {
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Votre session a expiré.");
      const form = new FormData();
      form.append("file", file);
      form.append("establishment_id", selectedEstablishment);
      form.append("period_start", periodStart);
      form.append("period_end", periodEnd);
      const response = await fetch("/api/product-analysis", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Analyse impossible.");
      await loadRuns();
      setSelectedRun(body.analysis_id);
      setMessage(`${body.line_count} lignes produits analysées et enregistrées.`);
      setFile(null);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError.message || "Analyse impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (access.loading) {
    return <main><section><p>Ouverture de l’analyse produits…</p></section></main>;
  }

  if (!access.allowed) {
    return (
      <main><section><div className="formCard">
        <h2>Accès protégé</h2>
        <p>Cette fonction est réservée à la direction et à l’administration.</p>
        <a href="/"><button>Retour</button></a>
      </div></section></main>
    );
  }

  const selected = runs.find((run) => run.id === selectedRun);

  return (
    <main>
      <header>
        <div>
          <div className="brand">MAISON ODDOS</div>
          <h1>Analyse produits</h1>
          <p>Classement des plats, formules et boissons à partir des Z détaillés.</p>
        </div>
        <a href="/"><button>← Pilotage</button></a>
      </header>

      <section>
        <div className="formCard">
          <h2>Lire un Z déjà archivé</h2>
          <p>Choisissez directement un PDF déjà reçu et conservé dans Maison Oddos.</p>
          <div className="grid">
            <label>
              Établissement
              <select
                value={selectedEstablishment}
                onChange={(event) => setSelectedEstablishment(event.target.value)}
                style={{ width: "100%", padding: 11, marginTop: 6 }}
              >
                {establishments.map((establishment) => (
                  <option key={establishment.id} value={establishment.id}>
                    {establishment.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Z disponible dans la base
              <select
                value={selectedArchive}
                onChange={(event) => setSelectedArchive(event.target.value)}
                style={{ width: "100%", padding: 11, marginTop: 6 }}
              >
                {!availableDocuments.length && <option value="">Aucun Z archivé</option>}
                {availableDocuments.map((document) => (
                  <option key={document.value} value={document.value}>
                    {document.date} · {document.kind} · {document.filename}
                    {document.analyzed ? " · déjà analysé" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={analyzeArchived}
            disabled={busy || !selectedArchive}
            style={{ marginTop: 16 }}
          >
            {busy ? "Lecture en cours…" : "Analyser ce Z archivé"}
          </button>
        </div>

        <div className="formCard" style={{ marginTop: 22 }}>
          <h2>Importer un nouveau Z détaillé</h2>
          <p>
            Importez le rapport qui contient les lignes d’articles vendus. Un Z avec seulement
            le CA et la TVA ne permet pas d’analyser les produits.
          </p>
          <form onSubmit={submit}>
            <div className="grid">
              <label>
                Établissement
                <select
                  value={selectedEstablishment}
                  onChange={(event) => setSelectedEstablishment(event.target.value)}
                  required
                  style={{ width: "100%", padding: 11, marginTop: 6 }}
                >
                  {establishments.map((establishment) => (
                    <option key={establishment.id} value={establishment.id}>
                      {establishment.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Début de période
                <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required />
              </label>
              <label>
                Fin de période
                <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required />
              </label>
              <label>
                Z détaillé (PDF ou image)
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  required
                />
              </label>
            </div>
            <button type="submit" disabled={busy} style={{ marginTop: 16 }}>
              {busy ? "Lecture en cours…" : "Analyser et enregistrer"}
            </button>
          </form>
        </div>

        {message && <p style={{ color: "#185c2b", fontWeight: 800 }}>{message}</p>}
        {error && <p style={{ color: "#b42318", fontWeight: 800 }}>Erreur : {error}</p>}

        <div className="formCard" style={{ marginTop: 22 }}>
          <div className="grid">
            <label>
              Analyse enregistrée
              <select
                value={selectedRun}
                onChange={(event) => setSelectedRun(event.target.value)}
                style={{ width: "100%", padding: 11, marginTop: 6 }}
              >
                {!availableRuns.length && <option value="">Aucune analyse</option>}
                {availableRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.period_start} au {run.period_end} · {run.source_filename}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Classement
              <select value={ranking} onChange={(event) => setRanking(event.target.value)} style={{ width: "100%", padding: 11, marginTop: 6 }}>
                <option value="quantity">Quantités vendues</option>
                <option value="sales">Chiffre d’affaires TTC</option>
              </select>
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14 }}>
            <input
              type="checkbox"
              checked={includeComponents}
              onChange={(event) => setIncludeComponents(event.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Inclure les composants internes des formules
          </label>
          {selected && (
            <small>
              Document : {selected.source_filename} · {selected.line_count} lignes reconnues
            </small>
          )}
        </div>

        <div className="grid" style={{ marginTop: 22 }}>
          <article className="card">
            <span>Produits différents</span>
            <strong>{report.products.length}</strong>
          </article>
          <article className="card">
            <span>Quantités enregistrées</span>
            <strong>{number(report.totalQuantity)}</strong>
          </article>
          <article className="card">
            <span>CA TTC des lignes lisibles</span>
            <strong>{report.totalSales ? money(report.totalSales) : "Non indiqué"}</strong>
          </article>
          <article className="card">
            <span>Part des formules en volume</span>
            <strong>{report.formulaShare.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %</strong>
          </article>
        </div>

        <div className="formCard" style={{ marginTop: 22 }}>
          <h2>Lecture stratégique</h2>
          {!report.products.length ? (
            <p>Sélectionnez ou importez une analyse pour afficher les résultats.</p>
          ) : (
            <div className="grid">
              <article className="card">
                <span>Meilleure vente en quantité</span>
                <strong>{report.topQuantity?.label || "—"}</strong>
                <small>{number(report.topQuantity?.quantity)} vendus</small>
              </article>
              <article className="card">
                <span>Premier produit en CA</span>
                <strong>{report.topSales?.label || "Non disponible"}</strong>
                <small>{report.topSales ? money(report.topSales.sales) : "CA par produit absent du Z"}</small>
              </article>
              <article className="card">
                <span>Faibles rotations à étudier</span>
                <strong>{report.lowSellers}</strong>
                <small>Produits à 15 % ou moins du meilleur volume</small>
              </article>
            </div>
          )}
          <p style={{ marginTop: 14 }}>
            Ces indicateurs mesurent les ventes, pas la rentabilité. Pour calculer la marge par plat,
            il faudra ensuite ajouter les fiches techniques et le coût matière.
          </p>
        </div>

        <h2 style={{ marginTop: 28 }}>Classement des produits</h2>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Produit</th>
                <th>Catégorie</th>
                <th>Quantité</th>
                <th>CA TTC</th>
                <th>Prix moyen</th>
                <th>Part volume</th>
              </tr>
            </thead>
            <tbody>
              {report.products.map((product, index) => (
                <tr key={`${product.label}-${index}`}>
                  <td>{index + 1}</td>
                  <td><b>{product.label}</b></td>
                  <td>{product.category}</td>
                  <td>{number(product.quantity)}</td>
                  <td>{product.hasSales ? money(product.sales) : "—"}</td>
                  <td>{product.hasSales && product.quantity ? money(product.sales / product.quantity) : "—"}</td>
                  <td>
                    {report.totalQuantity
                      ? `${((product.quantity / report.totalQuantity) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
                      : "—"}
                  </td>
                </tr>
              ))}
              {!report.products.length && (
                <tr><td colSpan="7">Aucune ligne produit disponible.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
