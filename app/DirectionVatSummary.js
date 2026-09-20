"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);
const euro = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(n || 0),
  );
export default function DirectionVatSummary() {
  const [host, setHost] = useState(null),
    [data, setData] = useState(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const main = document.querySelector("main");
      if (!main) return;
      const nav = [...main.querySelectorAll("nav button")].find(
        (b) => b.textContent.trim() === "Direction",
      );
      if (!nav?.classList.contains("active")) {
        setHost(null);
        return;
      }
      let h = document.getElementById("direction-vat-summary");
      if (!h) {
        const section = [...main.querySelectorAll("section")].find((s) =>
          s.querySelector(".hero"),
        );
        if (!section) return;
        h = document.createElement("div");
        h.id = "direction-vat-summary";
        const chart = [...section.querySelectorAll("div")].find((x) =>
          x.textContent?.includes("Évolution CA / Charges"),
        );
        if (chart) section.insertBefore(h, chart);
        else section.appendChild(h);
      }
      setHost(h);
      const estSel = [...main.querySelectorAll("select")].find((x) =>
          [...x.options].some((o) => o.textContent?.includes("CONSOLIDÉ")),
        ),
        est = estSel?.value || "all",
        ym =
          main.querySelector('input[type="month"]')?.value ||
          new Date().toISOString().slice(0, 7);
      const [{ data: sales }, { data: svat }, { data: inv }, { data: fix }] =
        await Promise.all([
          sb.from("daily_sales").select("id,establishment_id,business_date"),
          sb.from("daily_sale_vat_lines").select("daily_sale_id,vat_amount"),
          sb
            .from("supplier_invoices")
            .select("establishment_id,invoice_date,vat_amount,document_type"),
          sb
            .from("fixed_charges")
            .select(
              "establishment_id,month,end_month,recurring,amount,amount_ttc",
            ),
        ]);
      const ids = new Set(
        (sales || [])
          .filter(
            (x) =>
              x.business_date?.startsWith(ym) &&
              (est === "all" || x.establishment_id === est),
          )
          .map((x) => x.id),
      );
      const collected = (svat || [])
        .filter((x) => ids.has(x.daily_sale_id))
        .reduce((a, x) => a + Number(x.vat_amount || 0), 0);
      const purchases = (inv || [])
        .filter(
          (x) =>
            x.invoice_date?.startsWith(ym) &&
            (est === "all" || x.establishment_id === est),
        )
        .reduce(
          (a, x) =>
            a +
            (x.document_type === "credit_note" ? -1 : 1) *
              Number(x.vat_amount || 0),
          0,
        );
      const applies = (x) => {
        const s = String(x.month || "").slice(0, 7),
          e = String(x.end_month || "").slice(0, 7);
        return (
          (est === "all" || x.establishment_id === est) &&
          (x.recurring ? s <= ym && (!e || e >= ym) : s === ym)
        );
      };
      const charges = (fix || [])
        .filter(applies)
        .reduce(
          (a, x) =>
            a +
            Math.max(
              0,
              Number(x.amount_ttc ?? x.amount ?? 0) - Number(x.amount || 0),
            ),
          0,
        );
      if (!stop)
        setData({
          ym,
          collected,
          purchases,
          charges,
          net: collected - purchases - charges,
        });
    };
    load();
    const t = setInterval(load, 3000);
    window.addEventListener("pilotage-refresh", load);
    return () => {
      stop = true;
      clearInterval(t);
      window.removeEventListener("pilotage-refresh", load);
    };
  }, []);
  if (!host || !data) return null;
  return createPortal(
    <div className="formCard" style={{ marginTop: 22 }}>
      <h2>TVA du mois — estimation</h2>
      <p style={{ marginTop: -6 }}>
        Calcul automatique à partir des Z, factures fournisseurs et charges
        enregistrées.
      </p>
      <div className="cards">
        <article className="card">
          <span>TVA collectée ventes</span>
          <strong>{euro(data.collected)}</strong>
        </article>
        <article className="card">
          <span>TVA déductible achats</span>
          <strong>{euro(data.purchases)}</strong>
        </article>
        <article className="card">
          <span>TVA déductible charges</span>
          <strong>{euro(data.charges)}</strong>
        </article>
        <article
          className="card"
          style={{
            background: data.net >= 0 ? "#b42318" : "#48633a",
            color: "#fff",
          }}
        >
          <span style={{ color: "#fff" }}>
            {data.net >= 0 ? "TVA estimée à payer" : "Crédit de TVA estimé"}
          </span>
          <strong style={{ color: "#fff" }}>{euro(Math.abs(data.net))}</strong>
        </article>
      </div>
      <small>
        Estimation de pilotage : à rapprocher de la déclaration comptable avant
        paiement.
      </small>
    </div>,
    host,
  );
}
