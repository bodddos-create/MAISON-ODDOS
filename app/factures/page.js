"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);
const cats = [
  "Alimentaire",
  "Boissons",
  "Consommable",
  "Entretien",
  "Carburant",
  "Mobilier",
  "Energie",
  "Assurance",
  "Telephonie",
  "TPE",
  "Logiciel caisse",
];
const euro = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(n || 0),
  );
const sign = (x) => (x.document_type === "credit_note" ? -1 : 1);
const supplierKey = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-FR");
const st = {
  width: "100%",
  boxSizing: "border-box",
  padding: 11,
  marginTop: 6,
};
export default function Factures() {
  const editFormRef = useRef(null);
  const [user, setUser] = useState(undefined),
    [ests, setEsts] = useState([]),
    [rows, setRows] = useState([]),
    [imports, setImports] = useState([]),
    [edit, setEdit] = useState(null),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false),
    [selectedSupplier, setSelectedSupplier] = useState(""),
    [supplierPeriodMode, setSupplierPeriodMode] = useState("month"),
    [supplierMonth, setSupplierMonth] = useState(
      new Date().toISOString().slice(0, 7),
    ),
    [supplierYear, setSupplierYear] = useState(
      String(new Date().getFullYear()),
    ),
    [supplierEstablishment, setSupplierEstablishment] = useState("all");
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user]);
  useEffect(() => {
    if (!edit?.id) return;

    const frame = window.requestAnimationFrame(() => {
      editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      editFormRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [edit?.id]);
  async function load() {
    const [{ data: e }, { data: i }, { data: pending }] = await Promise.all([
      sb.from("establishments").select("id,name").eq("active", true),
      sb
        .from("supplier_invoices")
        .select("*")
        .order("invoice_date", { ascending: false })
        .limit(1000),
      sb
        .from("invoice_imports")
        .select(
          "id,email_id,attachment_id,filename,sender,subject,status,reason,analysis,document_path,created_at",
        )
        .in("status", ["review", "error"])
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setEsts(e || []);
    setRows(i || []);
    setImports(pending || []);
  }
  const name = (id) => ests.find((x) => x.id === id)?.name || "—";
  const archived = (item) =>
    String(item?.document_path || "").startsWith("invoices/");
  async function documentUrl(item) {
    if (!archived(item)) {
      throw new Error("Le PDF original n’est pas encore archivé.");
    }

    const { data, error } = await sb.storage
      .from("accounting-documents")
      .createSignedUrl(item.document_path, 3600);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Lien du document indisponible.");
    }

    return data.signedUrl;
  }
  async function viewDocument(item) {
    setMsg("");
    setBusy(true);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await documentUrl(item);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      setMsg("Erreur : " + error.message);
    } finally {
      setBusy(false);
    }
  }
  async function shareDocument(item, source) {
    const recipient = window.prompt("Adresse e-mail du destinataire :");
    if (!recipient) return;

    setMsg("");
    setBusy(true);
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error("Session expirée.");

      const response = await fetch("/api/invoice-share", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: recipient,
          ...(source === "import"
            ? { importId: item.id }
            : { invoiceId: item.id }),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Envoi impossible.");
      }

      setMsg(`✓ PDF envoyé à ${recipient}.`);
    } catch (error) {
      setMsg("Erreur : " + error.message);
    } finally {
      setBusy(false);
    }
  }
  function open(x) {
    setMsg("");
    setEdit({
      ...x,
      document_type: x.document_type || "invoice",
      amount_ht: String(x.amount_ht ?? ""),
      vat_amount: String(x.vat_amount ?? ""),
      due_date: x.due_date || "",
    });
  }
  function openImport(item) {
    const result = item.analysis?.result || {};
    const restaurantName = String(result.restaurant || "").toLocaleLowerCase(
      "fr-FR",
    );
    const establishment = ests.find((x) =>
      restaurantName.includes(String(x.name || "").toLocaleLowerCase("fr-FR")),
    );

    setMsg("");
    setEdit({
      id: null,
      source_import_id: item.id,
      source_email_id: item.email_id || null,
      source_attachment_id: item.attachment_id || null,
      document_path: item.document_path || null,
      vat_lines: Array.isArray(result.vatLines) ? result.vatLines : [],
      document_type:
        result.documentType === "credit_note" ? "credit_note" : "invoice",
      establishment_id: establishment?.id || ests[0]?.id || "",
      invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(result.date)
        ? result.date
        : "",
      supplier: String(result.supplier || ""),
      category: cats.includes(result.category) ? result.category : cats[0],
      invoice_number: String(result.number || ""),
      amount_ht: String(result.ht ?? ""),
      vat_amount: String(result.vat ?? ""),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(result.dueDate)
        ? result.dueDate
        : "",
      paid: false,
    });
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const payload = {
      establishment_id: edit.establishment_id,
      invoice_date: edit.invoice_date,
      supplier: edit.supplier.trim(),
      category: edit.category,
      invoice_number: edit.invoice_number?.trim() || null,
      amount_ht: Number(edit.amount_ht || 0),
      vat_amount: Number(edit.vat_amount || 0),
      due_date: edit.due_date || null,
      paid: !!edit.paid,
      document_type: edit.document_type || "invoice",
    };
    if (edit.source_import_id) {
      let invoiceId = null;
      let inserted = false;

      if (payload.invoice_number) {
        const { data: duplicates, error: duplicateError } = await sb
          .from("supplier_invoices")
          .select("id")
          .eq("establishment_id", payload.establishment_id)
          .eq("supplier", payload.supplier)
          .eq("invoice_number", payload.invoice_number)
          .eq("document_type", payload.document_type)
          .limit(1);

        if (duplicateError) {
          setBusy(false);
          return setMsg("Erreur : " + duplicateError.message);
        }

        invoiceId = duplicates?.[0]?.id || null;
      }

      const validatedPayload = {
        ...payload,
        document_path: edit.document_path || null,
        scan_status: "validated",
        source_email_id: edit.source_email_id || null,
        source_attachment_id: edit.source_attachment_id || null,
      };

      if (invoiceId) {
        const { error } = await sb
          .from("supplier_invoices")
          .update(validatedPayload)
          .eq("id", invoiceId);
        if (error) {
          setBusy(false);
          return setMsg("Erreur : " + error.message);
        }
      } else {
        const { data, error } = await sb
          .from("supplier_invoices")
          .insert({ ...validatedPayload, created_by: user.id })
          .select("id")
          .single();
        if (error) {
          setBusy(false);
          return setMsg("Erreur : " + error.message);
        }
        invoiceId = data.id;
        inserted = true;
      }

      const vatLines = (edit.vat_lines || [])
        .map((line) => ({
          invoice_id: invoiceId,
          vat_rate: Number(line.vat_rate || 0),
          amount_ht: Number(line.amount_ht || 0),
          vat_amount: Number(line.vat_amount || 0),
          amount_ttc: Number(line.amount_ttc || 0),
        }))
        .filter(
          (line) =>
            line.amount_ht >= 0 &&
            line.vat_amount >= 0 &&
            line.amount_ttc > 0,
        );
      const vatHt = vatLines.reduce((sum, line) => sum + line.amount_ht, 0);
      const vatAmount = vatLines.reduce(
        (sum, line) => sum + line.vat_amount,
        0,
      );

      if (
        vatLines.length &&
        Math.abs(vatHt - payload.amount_ht) <= 0.1 &&
        Math.abs(vatAmount - payload.vat_amount) <= 0.1
      ) {
        await sb
          .from("supplier_invoice_vat_lines")
          .delete()
          .eq("invoice_id", invoiceId);
        const { error: vatError } = await sb
          .from("supplier_invoice_vat_lines")
          .insert(vatLines);
        if (vatError) {
          if (inserted) {
            await sb.from("supplier_invoices").delete().eq("id", invoiceId);
          }
          setBusy(false);
          return setMsg("Erreur TVA : " + vatError.message);
        }
      }

      const { error: importError } = await sb
        .from("invoice_imports")
        .update({
          status: "saved",
          reason: null,
          invoice_id: invoiceId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", edit.source_import_id);

      if (importError) {
        if (inserted) {
          await sb.from("supplier_invoices").delete().eq("id", invoiceId);
        }
        setBusy(false);
        return setMsg("Erreur de validation : " + importError.message);
      }

      setMsg("✓ Facture contrôlée, validée et enregistrée.");
    } else {
      const { error } = await sb
        .from("supplier_invoices")
        .update(payload)
        .eq("id", edit.id);
      if (error) {
        setBusy(false);
        return setMsg("Erreur : " + error.message);
      }
      setMsg("✓ Document modifié.");
    }

    setBusy(false);
    setEdit(null);
    await load();
  }
  async function remove(x) {
    if (
      !window.confirm(
        `Supprimer définitivement ${x.document_type === "credit_note" ? "l’avoir" : "la facture"} ${x.invoice_number || ""} de ${x.supplier} ?`,
      )
    )
      return;
    setBusy(true);
    setMsg("");
    const { error } = await sb
      .from("supplier_invoices")
      .delete()
      .eq("id", x.id);
    setBusy(false);
    if (error) return setMsg("Erreur : " + error.message);
    if (edit?.id === x.id) setEdit(null);
    setMsg("✓ Document supprimé.");
    await load();
  }
  const supplierOptions = [
    ...new Map(
      rows
        .filter((x) => supplierKey(x.supplier))
        .map((x) => [supplierKey(x.supplier), String(x.supplier).trim()]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "fr", { sensitivity: "base" }));
  const supplierYears = [
    ...new Set(
      rows
        .map((x) => String(x.invoice_date || "").slice(0, 4))
        .filter((year) => /^\d{4}$/.test(year)),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const supplierPeriod =
    supplierPeriodMode === "month" ? supplierMonth : supplierYear;
  const supplierSummaryRows = selectedSupplier
    ? rows.filter(
        (x) =>
          supplierKey(x.supplier) === selectedSupplier &&
          String(x.invoice_date || "").startsWith(supplierPeriod) &&
          (supplierEstablishment === "all" ||
            x.establishment_id === supplierEstablishment),
      )
    : [];
  const selectedSupplierName =
    supplierOptions.find(([key]) => key === selectedSupplier)?.[1] || "";
  const displayedInvoiceRows = selectedSupplier ? supplierSummaryRows : rows;
  const supplierTotalHt = supplierSummaryRows.reduce(
    (total, x) => total + sign(x) * Number(x.amount_ht || 0),
    0,
  );
  const supplierInvoiceCount = supplierSummaryRows.filter(
    (x) => x.document_type !== "credit_note",
  ).length;
  const supplierCreditCount = supplierSummaryRows.filter(
    (x) => x.document_type === "credit_note",
  ).length;
  if (user === undefined)
    return (
      <main>
        <section>
          <p>Chargement…</p>
        </section>
      </main>
    );
  if (!user)
    return (
      <main>
        <section>
          <h2>Accès protégé</h2>
          <p>Connectez-vous d’abord à Maison Oddos.</p>
          <a href="/">
            <button>Retour à la connexion</button>
          </a>
        </section>
      </main>
    );
  return (
    <main>
      <header>
        <div>
          <div className="brand">MAISON ODDOS</div>
          <h1>Gestion des factures et avoirs</h1>
        </div>
        <a href="/">
          <button>← Pilotage</button>
        </a>
      </header>
      <section>
        {edit && (
          <div
            ref={editFormRef}
            tabIndex={-1}
            className="formCard"
            style={{ maxWidth: 850, marginBottom: 24, scrollMarginTop: 16 }}
          >
            <h2>
              {edit.source_import_id
                ? "Contrôler et valider le document"
                : "Modifier le document"}
            </h2>
            <form onSubmit={save}>
              <div className="grid">
                <label>
                  Type
                  <select
                    required
                    value={edit.document_type || "invoice"}
                    onChange={(e) =>
                      setEdit({ ...edit, document_type: e.target.value })
                    }
                    style={st}
                  >
                    <option value="invoice">Facture</option>
                    <option value="credit_note">Avoir</option>
                  </select>
                </label>
                <label>
                  Restaurant
                  <select
                    required
                    value={edit.establishment_id}
                    onChange={(e) =>
                      setEdit({ ...edit, establishment_id: e.target.value })
                    }
                    style={st}
                  >
                    {ests.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    required
                    value={edit.invoice_date}
                    onChange={(e) =>
                      setEdit({ ...edit, invoice_date: e.target.value })
                    }
                    style={st}
                  />
                </label>
                <label>
                  Fournisseur
                  <input
                    required
                    value={edit.supplier}
                    onChange={(e) =>
                      setEdit({ ...edit, supplier: e.target.value })
                    }
                    style={st}
                  />
                </label>
                <label>
                  Catégorie
                  <select
                    required
                    value={edit.category}
                    onChange={(e) =>
                      setEdit({ ...edit, category: e.target.value })
                    }
                    style={st}
                  >
                    {cats.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  N° document
                  <input
                    value={edit.invoice_number || ""}
                    onChange={(e) =>
                      setEdit({ ...edit, invoice_number: e.target.value })
                    }
                    style={st}
                  />
                </label>
                <label>
                  Montant HT
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={edit.amount_ht}
                    onChange={(e) =>
                      setEdit({ ...edit, amount_ht: e.target.value })
                    }
                    style={st}
                  />
                </label>
                <label>
                  TVA
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={edit.vat_amount}
                    onChange={(e) =>
                      setEdit({ ...edit, vat_amount: e.target.value })
                    }
                    style={st}
                  />
                </label>
                <label>
                  Échéance
                  <input
                    type="date"
                    value={edit.due_date}
                    onChange={(e) =>
                      setEdit({ ...edit, due_date: e.target.value })
                    }
                    style={st}
                  />
                </label>
              </div>
              <p>
                <b>
                  Impact TTC :{" "}
                  {euro(
                    sign(edit) *
                      (Number(edit.amount_ht || 0) +
                        Number(edit.vat_amount || 0)),
                  )}
                </b>
              </p>
              {edit.document_type === "credit_note" && (
                <p>
                  Saisissez les montants en positif : ils seront automatiquement
                  déduits.
                </p>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button disabled={busy}>
                  {edit.source_import_id
                    ? "Valider et enregistrer"
                    : "Enregistrer les modifications"}
                </button>
                <button type="button" onClick={() => setEdit(null)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}
        {msg && (
          <p>
            <b>{msg}</b>
          </p>
        )}
        <h2>Documents reçus à vérifier</h2>
        <p>
          Les factures et avoirs incertains restent ici sans modifier les
          chiffres.
        </p>
        <div className="table" style={{ marginBottom: 28 }}>
          <table>
            <thead>
              <tr>
                <th>Reçu le</th>
                <th>Fichier</th>
                <th>Expéditeur</th>
                <th>Lecture</th>
                <th>Raison</th>
                <th>Document</th>
              </tr>
            </thead>
            <tbody>
              {imports.length ? (
                imports.map((item) => {
                  const result = item.analysis?.result || {};

                  return (
                    <tr key={item.id}>
                      <td>
                        {new Date(item.created_at).toLocaleString("fr-FR")}
                      </td>
                      <td>
                        <b>{item.filename}</b>
                        {item.subject ? <div>{item.subject}</div> : null}
                      </td>
                      <td>{item.sender || "—"}</td>
                      <td>
                        {result.supplier || "Document non lu"}
                        {result.date ? <div>{result.date}</div> : null}
                        {result.ttc ? (
                          <div>
                            {result.documentType === "credit_note"
                              ? "Avoir · "
                              : "Facture · "}
                            {euro(result.ttc)} TTC
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <b>
                          {item.status === "error"
                            ? "Erreur de lecture"
                            : "À contrôler"}
                        </b>
                        <div>{item.reason || "Vérification nécessaire"}</div>
                      </td>
                      <td>
                        {archived(item) ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              onClick={() => viewDocument(item)}
                              disabled={busy}
                            >
                              Voir le justificatif
                            </button>
                            <button
                              onClick={() => shareDocument(item, "import")}
                              disabled={busy}
                            >
                              Envoyer au comptable
                            </button>
                            <button
                              onClick={() => openImport(item)}
                              disabled={busy}
                            >
                              Corriger / Valider
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6">Aucun document en attente.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="formCard" style={{ marginBottom: 28 }}>
          <h2>Achats HT par fournisseur</h2>
          <p>
            Sélectionnez un fournisseur et une période. Les avoirs sont
            automatiquement déduits du total HT.
          </p>
          <div className="grid">
            <label>
              Fournisseur
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                style={st}
              >
                <option value="">Choisir un fournisseur</option>
                {supplierOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Calcul par
              <select
                value={supplierPeriodMode}
                onChange={(e) => setSupplierPeriodMode(e.target.value)}
                style={st}
              >
                <option value="month">Mois</option>
                <option value="year">Année</option>
              </select>
            </label>
            {supplierPeriodMode === "month" ? (
              <label>
                Mois
                <input
                  type="month"
                  value={supplierMonth}
                  onChange={(e) => setSupplierMonth(e.target.value)}
                  style={st}
                />
              </label>
            ) : (
              <label>
                Année
                <select
                  value={supplierYear}
                  onChange={(e) => setSupplierYear(e.target.value)}
                  style={st}
                >
                  {supplierYears.length ? (
                    supplierYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))
                  ) : (
                    <option value={supplierYear}>{supplierYear}</option>
                  )}
                </select>
              </label>
            )}
            <label>
              Établissement
              <select
                value={supplierEstablishment}
                onChange={(e) => setSupplierEstablishment(e.target.value)}
                style={st}
              >
                <option value="all">Tous les établissements</option>
                {ests.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            style={{
              marginTop: 18,
              padding: 20,
              borderRadius: 14,
              background: selectedSupplier ? "#e8f3e8" : "#f3f1eb",
            }}
          >
            {selectedSupplier ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#48633a" }}>
                  TOTAL ACHETÉ HT · {supplierPeriod}
                </div>
                <div style={{ fontSize: 34, fontWeight: 900, marginTop: 5 }}>
                  {euro(supplierTotalHt)}
                </div>
                <div style={{ marginTop: 6 }}>
                  {supplierInvoiceCount} facture
                  {supplierInvoiceCount > 1 ? "s" : ""}
                  {supplierCreditCount
                    ? ` · ${supplierCreditCount} avoir${supplierCreditCount > 1 ? "s" : ""} déduit${supplierCreditCount > 1 ? "s" : ""}`
                    : ""}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSupplier("")}
                  style={{ marginTop: 12 }}
                >
                  Afficher tous les fournisseurs
                </button>
              </>
            ) : (
              <b>Choisissez un fournisseur pour afficher son total HT.</b>
            )}
          </div>
        </div>
        <h2>
          {selectedSupplier
            ? `Factures et avoirs · ${selectedSupplierName}`
            : "Factures et avoirs fournisseurs"}
        </h2>
        {selectedSupplier && (
          <p>
            {displayedInvoiceRows.length} document
            {displayedInvoiceRows.length > 1 ? "s" : ""} pour la période et
            l’établissement sélectionnés.
          </p>
        )}
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Établissement</th>
                <th>Fournisseur</th>
                <th>Catégorie</th>
                <th>HT</th>
                <th>TVA</th>
                <th>TTC</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedInvoiceRows.length ? (
                displayedInvoiceRows.map((x) => (
                  <tr key={x.id}>
                    <td>{x.invoice_date}</td>
                    <td>
                      <b>
                        {x.document_type === "credit_note"
                          ? "Avoir"
                          : "Facture"}
                      </b>
                    </td>
                    <td>{name(x.establishment_id)}</td>
                    <td>{x.supplier}</td>
                    <td>{x.category}</td>
                    <td>{euro(sign(x) * Number(x.amount_ht || 0))}</td>
                    <td>{euro(sign(x) * Number(x.vat_amount || 0))}</td>
                    <td>
                      <b>
                        {euro(
                          sign(x) *
                            (Number(x.amount_ht || 0) +
                              Number(x.vat_amount || 0)),
                        )}
                      </b>
                    </td>
                    <td>
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        <button onClick={() => open(x)}>
                          Ouvrir / Modifier
                        </button>
                        {archived(x) && (
                          <>
                            <button
                              onClick={() => viewDocument(x)}
                              disabled={busy}
                            >
                              Voir le justificatif
                            </button>
                            <button
                              onClick={() => shareDocument(x, "invoice")}
                              disabled={busy}
                            >
                              Envoyer au comptable
                            </button>
                          </>
                        )}
                        <button onClick={() => remove(x)} disabled={busy}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9">
                    {selectedSupplier
                      ? "Aucun document pour ces filtres."
                      : "Aucun document."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
