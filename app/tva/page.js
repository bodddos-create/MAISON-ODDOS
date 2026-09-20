"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);
const euro = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(n || 0),
  );
const today = () => new Date().toISOString().slice(0, 10),
  input = { width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5 };
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
  ],
  newLine = () => ({ vat_rate: "", amount_ht: "" });
const calc = (l) => {
  const ht = Number(l.amount_ht || 0),
    rate = Number(l.vat_rate || 0),
    vat = Math.round(ht * rate) / 100;
  return { ht, rate, vat, ttc: ht + vat };
};
export default function VatPage() {
  const [user, setUser] = useState(undefined),
    [ests, setEsts] = useState([]),
    [type, setType] = useState("invoice"),
    [msg, setMsg] = useState(""),
    [saving, setSaving] = useState(false),
    [lines, setLines] = useState([newLine()]);
  const [inv, setInv] = useState({
      establishment_id: "",
      invoice_date: today(),
      supplier: "",
      category: "",
      invoice_number: "",
      due_date: "",
      paid: false,
      document_type: "invoice",
    }),
    [z, setZ] = useState({
      establishment_id: "",
      business_date: today(),
      lunch_covers: "",
      dinner_covers: "",
      staff_hours: "",
      staff_cost: "",
    });
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);
  useEffect(() => {
    if (user)
      sb.from("establishments")
        .select("*")
        .eq("active", true)
        .then(({ data }) => {
          setEsts(data || []);
          if (data?.[0]) {
            setInv((v) => ({ ...v, establishment_id: data[0].id }));
            setZ((v) => ({ ...v, establishment_id: data[0].id }));
          }
        });
  }, [user]);
  const totals = useMemo(
    () =>
      lines.reduce(
        (a, l) => {
          const c = calc(l);
          return { ht: a.ht + c.ht, vat: a.vat + c.vat, ttc: a.ttc + c.ttc };
        },
        { ht: 0, vat: 0, ttc: 0 },
      ),
    [lines],
  );
  function setLine(i, k, v) {
    setLines((x) => x.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  }
  async function save(e) {
    e.preventDefault();
    setMsg("");
    const valid = lines.filter(
      (l) => Number(l.amount_ht) > 0 && l.vat_rate !== "",
    );
    if (!valid.length) return setMsg("Ajoutez au moins une ligne de TVA.");
    setSaving(true);
    if (type === "invoice") {
      if (inv.invoice_number) {
        const { data: x } = await sb
          .from("supplier_invoices")
          .select("id")
          .eq("establishment_id", inv.establishment_id)
          .eq("supplier", inv.supplier.trim())
          .eq("invoice_number", inv.invoice_number.trim())
          .eq("document_type", inv.document_type)
          .limit(1);
        if (x?.length) {
          setSaving(false);
          return setMsg("⚠️ Ce document semble déjà enregistré.");
        }
      }
      const { data: p, error } = await sb
        .from("supplier_invoices")
        .insert({
          ...inv,
          supplier: inv.supplier.trim(),
          invoice_number: inv.invoice_number.trim() || null,
          due_date: inv.due_date || null,
          amount_ht: totals.ht,
          vat_amount: totals.vat,
          created_by: user.id,
          scan_status: "manual",
        })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        return setMsg("Erreur : " + error.message);
      }
      const rows = valid.map((l) => {
        const c = calc(l);
        return {
          invoice_id: p.id,
          vat_rate: c.rate,
          amount_ht: c.ht,
          vat_amount: c.vat,
          amount_ttc: c.ttc,
        };
      });
      const { error: le } = await sb
        .from("supplier_invoice_vat_lines")
        .insert(rows);
      if (le) {
        await sb.from("supplier_invoices").delete().eq("id", p.id);
        setSaving(false);
        return setMsg("Erreur TVA : " + le.message);
      }
    } else {
      const { data: x } = await sb
        .from("daily_sales")
        .select("id")
        .eq("establishment_id", z.establishment_id)
        .eq("business_date", z.business_date)
        .limit(1);
      if (x?.length) {
        setSaving(false);
        return setMsg(
          "⚠️ Un Z existe déjà pour cet établissement à cette date.",
        );
      }
      const { data: p, error } = await sb
        .from("daily_sales")
        .insert({
          ...z,
          lunch_sales_ht: totals.ht,
          dinner_sales_ht: 0,
          lunch_covers: Number(z.lunch_covers || 0),
          dinner_covers: 0,
          staff_hours: Number(z.staff_hours || 0),
          staff_cost: Number(z.staff_cost || 0),
          created_by: user.id,
          z_scan_status: "manual",
        })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        return setMsg("Erreur : " + error.message);
      }
      const rows = valid.map((l) => {
        const c = calc(l);
        return {
          daily_sale_id: p.id,
          vat_rate: c.rate,
          amount_ht: c.ht,
          vat_amount: c.vat,
          amount_ttc: c.ttc,
        };
      });
      const { error: le } = await sb.from("daily_sale_vat_lines").insert(rows);
      if (le) {
        await sb.from("daily_sales").delete().eq("id", p.id);
        setSaving(false);
        return setMsg("Erreur TVA : " + le.message);
      }
    }
    const savedDocumentType = inv.document_type;
    setSaving(false);
    setLines([newLine()]);
    if (type === "invoice") {
      setInv((value) => ({
        ...value,
        invoice_date: today(),
        supplier: "",
        category: "",
        invoice_number: "",
        due_date: "",
        paid: false,
        document_type: "invoice",
      }));
    }
    setMsg(
      type === "invoice"
        ? savedDocumentType === "credit_note"
          ? "✓ Avoir enregistré et déduit des achats."
          : "✓ Facture enregistrée avec détail TVA."
        : "✓ Z enregistré avec détail TVA.",
    );
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
          <h2>Connexion requise</h2>
          <a href="/">Retour au Pilotage</a>
        </section>
      </main>
    );
  const Est = ({ value, onChange }) => (
    <select required value={value} onChange={onChange} style={input}>
      {ests.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
  return (
    <main>
      <section>
        <a href="/">← Retour au Pilotage</a>
        <div className="formCard" style={{ maxWidth: 850, marginTop: 18 }}>
          <h1>HT / TVA / TTC</h1>
          <p>
            Saisie multi-taux. Le pilotage reste calculé en HT ; le TTC sert au
            contrôle.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className={type === "invoice" ? "active" : ""}
              onClick={() => setType("invoice")}
            >
              Facture / Avoir
            </button>
            <button
              className={type === "z" ? "active" : ""}
              onClick={() => setType("z")}
            >
              Z de caisse
            </button>
          </div>
          <form onSubmit={save}>
            {type === "invoice" ? (
              <>
                <label>
                  Restaurant
                  <Est
                    value={inv.establishment_id}
                    onChange={(e) =>
                      setInv({ ...inv, establishment_id: e.target.value })
                    }
                  />
                </label>
                <div className="grid">
                  <label>
                    Type de document
                    <select
                      required
                      value={inv.document_type}
                      onChange={(e) =>
                        setInv({ ...inv, document_type: e.target.value })
                      }
                      style={input}
                    >
                      <option value="invoice">Facture</option>
                      <option value="credit_note">Avoir</option>
                    </select>
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      required
                      value={inv.invoice_date}
                      onChange={(e) =>
                        setInv({ ...inv, invoice_date: e.target.value })
                      }
                      style={input}
                    />
                  </label>
                  <label>
                    Fournisseur
                    <input
                      required
                      value={inv.supplier}
                      onChange={(e) =>
                        setInv({ ...inv, supplier: e.target.value })
                      }
                      style={input}
                    />
                  </label>
                  <label>
                    Catégorie
                    <select
                      required
                      value={inv.category}
                      onChange={(e) =>
                        setInv({ ...inv, category: e.target.value })
                      }
                      style={input}
                    >
                      <option value="">Choisir…</option>
                      {cats.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    N° document
                    <input
                      value={inv.invoice_number}
                      onChange={(e) =>
                        setInv({ ...inv, invoice_number: e.target.value })
                      }
                      style={input}
                    />
                  </label>
                </div>
                {inv.document_type === "credit_note" && (
                  <p style={{ color: "#5d6d3e", fontWeight: 700 }}>
                    Saisissez les montants en positif : l’avoir sera
                    automatiquement soustrait des achats et de la TVA.
                  </p>
                )}
              </>
            ) : (
              <>
                <label>
                  Restaurant
                  <Est
                    value={z.establishment_id}
                    onChange={(e) =>
                      setZ({ ...z, establishment_id: e.target.value })
                    }
                  />
                </label>
                <div className="grid">
                  <label>
                    Date
                    <input
                      type="date"
                      required
                      value={z.business_date}
                      onChange={(e) =>
                        setZ({ ...z, business_date: e.target.value })
                      }
                      style={input}
                    />
                  </label>
                  <label>
                    Nombre de couverts
                    <input
                      type="number"
                      min="0"
                      value={z.lunch_covers}
                      onChange={(e) =>
                        setZ({
                          ...z,
                          lunch_covers: e.target.value,
                          dinner_covers: "",
                        })
                      }
                      style={input}
                    />
                  </label>
                </div>
              </>
            )}
            <h3>Détail TVA</h3>
            {lines.map((l, i) => {
              const c = calc(l);
              return (
                <div
                  key={i}
                  className="grid"
                  style={{ alignItems: "end", marginBottom: 8 }}
                >
                  <label>
                    Taux TVA %
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={l.vat_rate}
                      onChange={(e) => setLine(i, "vat_rate", e.target.value)}
                      style={input}
                    />
                  </label>
                  <label>
                    Montant HT
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={l.amount_ht}
                      onChange={(e) => setLine(i, "amount_ht", e.target.value)}
                      style={input}
                    />
                  </label>
                  <div>
                    <small>TVA</small>
                    <b style={{ display: "block" }}>{euro(c.vat)}</b>
                  </div>
                  <div>
                    <small>TTC</small>
                    <b style={{ display: "block" }}>{euro(c.ttc)}</b>
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((x) => x.filter((_, j) => j !== i))
                      }
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setLines((x) => [...x, newLine()])}
            >
              + Ajouter un taux de TVA
            </button>
            <div className="grid" style={{ marginTop: 18 }}>
              <article className="card">
                <span>Total HT</span>
                <strong>{euro(totals.ht)}</strong>
              </article>
              <article className="card">
                <span>Total TVA</span>
                <strong>{euro(totals.vat)}</strong>
              </article>
              <article className="card">
                <span>Total TTC</span>
                <strong>{euro(totals.ttc)}</strong>
              </article>
            </div>
            <button disabled={saving} style={{ marginTop: 18, padding: 13 }}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {msg && <p>{msg}</p>}
          </form>
        </div>
      </section>
    </main>
  );
}
