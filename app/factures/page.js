"use client";
import { useEffect, useState } from "react";
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
const st = {
  width: "100%",
  boxSizing: "border-box",
  padding: 11,
  marginTop: 6,
};
export default function Factures() {
  const [user, setUser] = useState(undefined),
    [ests, setEsts] = useState([]),
    [rows, setRows] = useState([]),
    [imports, setImports] = useState([]),
    [edit, setEdit] = useState(null),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user]);
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
          "id,filename,sender,subject,status,reason,analysis,document_path,created_at",
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
    const { error } = await sb
      .from("supplier_invoices")
      .update(payload)
      .eq("id", edit.id);
    setBusy(false);
    if (error) return setMsg("Erreur : " + error.message);
    setMsg("✓ Document modifié.");
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
          <div className="formCard" style={{ maxWidth: 850, marginBottom: 24 }}>
            <h2>Modifier le document</h2>
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
                <button disabled={busy}>Enregistrer les modifications</button>
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
                              Voir le PDF
                            </button>
                            <button
                              onClick={() => shareDocument(item, "import")}
                              disabled={busy}
                            >
                              Envoyer par e-mail
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
        <h2>Factures et avoirs fournisseurs</h2>
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
              {rows.length ? (
                rows.map((x) => (
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
                              Voir le PDF
                            </button>
                            <button
                              onClick={() => shareDocument(x, "invoice")}
                              disabled={busy}
                            >
                              Envoyer par e-mail
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
                  <td colSpan="9">Aucun document.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
