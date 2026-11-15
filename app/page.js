"use client";
import { useEffect, useMemo, useState } from "react";
import ClockManager from "./ClockManager";
import { createClient } from "@supabase/supabase-js";
const VILLA_ID = "8395bf22-99cb-4a7b-9096-ca734d583d83";
const PARC_ID = "55c6e880-aa0c-40d6-9065-b5315b1a602a";

const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);
const euro = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(n || 0),
  );
const today = () => new Date().toISOString().slice(0, 10);
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
];
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: 11,
  marginTop: 6,
};
const emptyEmp = () => ({
  establishment_id: "",
  full_name: "",
  job_title: "",
  entry_date: today(),
  contract_type: "CDI",
  weekly_hours: "35",
  net_salary: "",
  employee_charge_rate: "22",
  employer_charge_rate: "42",
  active: true,
});
const emptyHours = () => ({
  employee_id: "",
  work_date: today(),
  hours_worked: "",
  note: "",
});
function salaryCalc(e) {
  const net = Number(e.net_salary || 0),
    sal = Number(e.employee_charge_rate || 0),
    pat = Number(e.employer_charge_rate || 0),
    brut = sal < 100 ? net / (1 - sal / 100) : 0,
    chargesSal = Math.max(0, brut - net),
    chargesPat = (brut * pat) / 100,
    cost = brut + chargesPat,
    monthlyHours = (Number(e.weekly_hours || 0) * 52) / 12;
  return {
    net,
    brut,
    chargesSal,
    chargesPat,
    cost,
    hourly: monthlyHours ? cost / monthlyHours : 0,
  };
}
export default function Home() {
  const [user, setUser] = useState(undefined),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [authMsg, setAuthMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const [ests, setEsts] = useState([]),
    [sales, setSales] = useState([]),
    [invoices, setInvoices] = useState([]),
    [charges, setCharges] = useState([]),
    [employees, setEmployees] = useState([]),
    [hours, setHours] = useState([]),
    [openingDays, setOpeningDays] = useState([]),
    [tab, setTab] = useState("direction"),
    [selectedEst, setSelectedEst] = useState(VILLA_ID);
  const [commercialForecast, setCommercialForecast] = useState({ total: 0, count: 0, loading: true, error: false });
  const [entryType, setEntryType] = useState("z"),
    [personnelView, setPersonnelView] = useState("salaries"),
    [chartView, setChartView] = useState("month"),
    [chartMonth, setChartMonth] = useState(today().slice(0, 7)),
    [chartYear, setChartYear] = useState(today().slice(0, 4)),
    [saveMsg, setSaveMsg] = useState(""),
    [saving, setSaving] = useState(false),
    [documentMsg, setDocumentMsg] = useState(""),
    [documentBusy, setDocumentBusy] = useState(false);
  const [z, setZ] = useState({
    establishment_id: "",
    business_date: today(),
    lunch_sales_ht: "",
    dinner_sales_ht: "",
    lunch_covers: "",
    dinner_covers: "",
    staff_hours: "",
    staff_cost: "",
  });
  const [inv, setInv] = useState({
    establishment_id: "",
    invoice_date: today(),
    supplier: "",
    category: "",
    invoice_number: "",
    amount_ht: "",
    vat_amount: "",
    due_date: "",
    paid: false,
    document_type: "invoice",
  });
  const [emp, setEmp] = useState(emptyEmp()),
    [hour, setHour] = useState(emptyHours()),
    [charge, setCharge] = useState({
      id: null,
      establishment_id: "",
      month: today().slice(0, 7),
      category: "Loyer",
      label: "",
      amount: "",
      vat_rate: "",
      recurring: true,
      end_month: "",
    });
  useEffect(() => {
    let alive = true;
    sb.auth.getUser().then(({ data }) => alive && setUser(data?.user || null));
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e, s) => alive && setUser(s?.user || null));
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user]);
  useEffect(() => {
    if (!user || tab !== "direction") return undefined;
    let active = true;
    setCommercialForecast((current) => ({ ...current, loading: true, error: false }));
    async function refreshCommercialForecast() {
      const { data, error } = await sb.rpc("commercial_future_total", {
        p_establishment_id: selectedEst,
      }).single();
      if (!active) return;
      setCommercialForecast(error || !data
        ? { total: 0, count: 0, loading: false, error: true }
        : { total: Number(data.total_ttc || 0), count: Number(data.prestations || 0), loading: false, error: false });
    }
    refreshCommercialForecast();
    const interval = window.setInterval(refreshCommercialForecast, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshCommercialForecast();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, tab, selectedEst]);
  useEffect(() => {
    if (ests.length) {
      const id = ests[0].id;
      setZ((v) => ({ ...v, establishment_id: v.establishment_id || id }));
      setInv((v) => ({ ...v, establishment_id: v.establishment_id || id }));
      setEmp((v) => ({ ...v, establishment_id: v.establishment_id || id }));
      setCharge((v) => ({ ...v, establishment_id: v.establishment_id || id }));
    }
  }, [ests]);
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setAuthMsg("");
    const { error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) setAuthMsg("Adresse e-mail ou mot de passe incorrect.");
  }
  async function reset() {
    if (!email.trim()) return setAuthMsg("Indiquez votre adresse e-mail.");
    setBusy(true);
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    setAuthMsg(
      error
        ? "Impossible d’envoyer le lien pour le moment."
        : "Demande envoyée. Vérifiez votre messagerie.",
    );
  }
  async function logout() {
    await sb.auth.signOut();
    setSales([]);
    setInvoices([]);
    setCharges([]);
    setEmployees([]);
    setHours([]);
    setEsts([]);
  }
  async function load() {
    const [
      { data: e },
      { data: s },
      { data: i },
      { data: c },
      { data: p },
      { data: h },
      { data: o },
    ] = await Promise.all([
      sb.from("establishments").select("*").eq("active", true),
      sb
        .from("daily_sales")
        .select("*")
        .order("business_date", { ascending: false })
        .limit(1000),
      sb
        .from("supplier_invoices")
        .select("*")
        .order("invoice_date", { ascending: false })
        .limit(1000),
      sb
        .from("fixed_charges")
        .select("*")
        .order("month", { ascending: false })
        .limit(500),
      sb.from("employees").select("*").order("full_name"),
      sb
        .from("employee_hours")
        .select("*")
        .order("work_date", { ascending: false })
        .limit(3000),
      sb.from("opening_days").select("establishment_id,business_date,is_open"),
    ]);
    setEsts(e || []);
    setSales(s || []);
    setInvoices(i || []);
    setCharges(c || []);
    setEmployees(p || []);
    setHours(h || []);
    setOpeningDays(o || []);
  }
  async function saveZ(e) {
    e.preventDefault();
    setSaveMsg("");
    if (!z.establishment_id) return setSaveMsg("Choisissez un établissement.");
    setSaving(true);
    const { data: existing } = await sb
      .from("daily_sales")
      .select("id")
      .eq("establishment_id", z.establishment_id)
      .eq("business_date", z.business_date)
      .limit(1);
    if (existing?.length) {
      setSaving(false);
      return setSaveMsg(
        "⚠️ Un Z existe déjà pour cet établissement à cette date.",
      );
    }
    const payload = {
      ...z,
      lunch_sales_ht: Number(z.lunch_sales_ht || 0),
      dinner_sales_ht: Number(z.dinner_sales_ht || 0),
      lunch_covers: Number(z.lunch_covers || 0),
      dinner_covers: Number(z.dinner_covers || 0),
      staff_hours: Number(z.staff_hours || 0),
      staff_cost: Number(z.staff_cost || 0),
      created_by: user.id,
      z_scan_status: "manual",
    };
    const { error } = await sb.from("daily_sales").insert(payload);
    setSaving(false);
    if (error) return setSaveMsg("Erreur : " + error.message);
    setSaveMsg("✓ Z enregistré.");
    setZ((v) => ({
      ...v,
      business_date: today(),
      lunch_sales_ht: "",
      dinner_sales_ht: "",
      lunch_covers: "",
      dinner_covers: "",
      staff_hours: "",
      staff_cost: "",
    }));
    await load();
  }
  async function saveInvoice(e) {
    e.preventDefault();
    setSaveMsg("");
    setSaving(true);
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
        return setSaveMsg("⚠️ Ce document semble déjà enregistré.");
      }
    }
    const payload = {
      ...inv,
      supplier: inv.supplier.trim(),
      invoice_number: inv.invoice_number.trim() || null,
      amount_ht: Number(inv.amount_ht || 0),
      vat_amount: Number(inv.vat_amount || 0),
      due_date: inv.due_date || null,
      created_by: user.id,
      scan_status: "manual",
    };
    const { error } = await sb.from("supplier_invoices").insert(payload);
    setSaving(false);
    if (error) return setSaveMsg("Erreur : " + error.message);
    setSaveMsg(
      inv.document_type === "credit_note"
        ? "✓ Avoir enregistré."
        : "✓ Facture enregistrée.",
    );
    setInv((v) => ({
      ...v,
      invoice_date: today(),
      supplier: "",
      category: "",
      invoice_number: "",
      amount_ht: "",
      vat_amount: "",
      due_date: "",
      paid: false,
      document_type: "invoice",
    }));
    await load();
  }
  async function saveEmployee(e) {
    e.preventDefault();
    setSaveMsg("");
    const calc = salaryCalc(emp);
    setSaving(true);
    const payload = {
      establishment_id: emp.establishment_id,
      full_name: emp.full_name.trim(),
      job_title: emp.job_title.trim(),
      entry_date: emp.entry_date || null,
      contract_type: emp.contract_type,
      weekly_hours: Number(emp.weekly_hours || 0),
      net_salary: calc.net,
      employee_charge_rate: Number(emp.employee_charge_rate || 0),
      employer_charge_rate: Number(emp.employer_charge_rate || 0),
      monthly_loaded_cost: calc.cost,
      hourly_cost: calc.hourly,
      active: emp.active,
      created_by: user.id,
    };
    const { error } = await sb.from("employees").insert(payload);
    setSaving(false);
    if (error) return setSaveMsg("Erreur : " + error.message);
    setSaveMsg("✓ Salarié enregistré.");
    const id = emp.establishment_id;
    setEmp({ ...emptyEmp(), establishment_id: id });
    await load();
  }
  async function saveCharge(e) {
    e.preventDefault();
    setSaveMsg("");
    if (!charge.establishment_id)
      return setSaveMsg("Choisissez un établissement.");
    setSaving(true);
    const payload = {
      establishment_id: charge.establishment_id,
      month: charge.month + "-01",
      category: charge.category,
      label: charge.label.trim() || null,
      amount: Number(charge.amount || 0),
      amount_ttc:
        Number(charge.amount || 0) * (1 + Number(charge.vat_rate || 0) / 100),
      recurring: charge.recurring,
      end_month:
        charge.recurring && charge.end_month ? charge.end_month + "-01" : null,
      created_by: user.id,
    };
    let error;
    if (charge.id) {
      ({ error } = await sb
        .from("fixed_charges")
        .update(payload)
        .eq("id", charge.id));
    } else {
      ({ error } = await sb.from("fixed_charges").insert(payload));
    }
    setSaving(false);
    if (error) return setSaveMsg("Erreur : " + error.message);
    setSaveMsg(
      charge.id ? "✓ Charge modifiée." : "✓ Charge enregistrée et programmée.",
    );
    window.dispatchEvent(new Event("pilotage-refresh"));
    setCharge((v) => ({
      ...v,
      id: null,
      label: "",
      amount: "",
      vat_rate: "",
      end_month: "",
    }));
    await load();
  }
  async function deleteCharge(id) {
    if (!window.confirm("Supprimer cette charge ?")) return;
    const { error } = await sb.from("fixed_charges").delete().eq("id", id);
    if (error) return setSaveMsg("Erreur : " + error.message);
    setSaveMsg("✓ Charge supprimée.");
    window.dispatchEvent(new Event("pilotage-refresh"));
    if (charge.id === id)
      setCharge((v) => ({
        ...v,
        id: null,
        label: "",
        amount: "",
        end_month: "",
      }));
    await load();
  }
  async function saveHours(e) {
    e.preventDefault();
    setSaveMsg("");
    const employee = employees.find((x) => x.id === hour.employee_id);
    if (!employee) return setSaveMsg("Choisissez un salarié.");
    setSaving(true);
    const payload = {
      employee_id: employee.id,
      establishment_id: employee.establishment_id,
      work_date: hour.work_date,
      hours_worked: Number(hour.hours_worked || 0),
      loaded_cost:
        Number(hour.hours_worked || 0) * Number(employee.hourly_cost || 0),
      note: hour.note.trim() || null,
      created_by: user.id,
    };
    const { error } = await sb
      .from("employee_hours")
      .upsert(payload, { onConflict: "employee_id,work_date" });
    setSaving(false);
    if (error) return setSaveMsg("Erreur : " + error.message);
    setSaveMsg("✓ Heures enregistrées et coût calculé.");
    setHour((v) => ({ ...v, hours_worked: "", note: "" }));
    await load();
  }
  const fs = sales.filter((x) => x.establishment_id === selectedEst),
    fi = invoices.filter((x) => x.establishment_id === selectedEst),
    fc = charges.filter((x) => x.establishment_id === selectedEst),
    fe = employees.filter((x) => x.establishment_id === selectedEst),
    fh = hours.filter((x) => x.establishment_id === selectedEst);
  const totals = useMemo(() => {
    const periodSales = fs.filter((x) =>
        String(x.business_date || "").startsWith(chartMonth),
      ),
      periodInvoices = fi.filter((x) =>
        String(x.invoice_date || "").startsWith(chartMonth),
      ),
      chargeApplies = (x) => {
        const start = String(x.month || "").slice(0, 7);
        const end = String(x.end_month || "").slice(0, 7);
        return x.recurring
          ? start <= chartMonth && (!end || end >= chartMonth)
          : start === chartMonth;
      },
      periodCharges = fc.filter(chargeApplies),
      ca = periodSales.reduce(
        (a, x) =>
          a + Number(x.lunch_sales_ht || 0) + Number(x.dinner_sales_ht || 0),
        0,
      ),
      covers = periodSales.reduce(
        (a, x) =>
          a + Number(x.lunch_covers || 0) + Number(x.dinner_covers || 0),
        0,
      ),
      personnel = periodSales.reduce(
        (a, x) => a + Number(x.staff_cost || 0),
        0,
      ),
      achats = periodInvoices.reduce(
        (a, x) =>
          a +
          (x.document_type === "credit_note" ? -1 : 1) *
            Number(x.amount_ht || 0),
        0,
      ),
      fixes = periodCharges.reduce((a, x) => a + Number(x.amount || 0), 0),
      ym = chartMonth,
      ids = [selectedEst],
      habitualOpen = (id, date) => {
        const d = date.getDay();
        return id === "8395bf22-99cb-4a7b-9096-ca734d583d83"
          ? d >= 2 && d <= 6
          : d >= 1 && d <= 6;
      },
      parts = ym.split("-").map(Number),
      yy = parts[0],
      mm = parts[1],
      daysInMonth = new Date(yy, mm, 0).getDate(),
      workDays = ids.reduce((sum, id) => {
        const custom = openingDays.filter(
          (x) =>
            x.establishment_id === id && String(x.business_date).startsWith(ym),
        );
        if (custom.length) {
          const by = Object.fromEntries(
            custom.map((x) => [
              String(x.business_date).slice(0, 10),
              !!x.is_open,
            ]),
          );
          let n = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            const ds = ym + "-" + String(d).padStart(2, "0");
            if (ds in by ? by[ds] : habitualOpen(id, new Date(yy, mm - 1, d)))
              n++;
          }
          return sum + n;
        }
        let n = 0;
        for (let d = 1; d <= daysInMonth; d++)
          if (habitualOpen(id, new Date(yy, mm - 1, d))) n++;
        return sum + n;
      }, 0),
      actualDays = new Set(
        fs
          .filter(
            (x) =>
              String(x.business_date).startsWith(ym) &&
              Number(x.lunch_sales_ht || 0) + Number(x.dinner_sales_ht || 0) >
                0,
          )
          .map((x) => x.business_date),
      ).size,
      avgDay = actualDays ? ca / actualDays : 0,
      forecast = avgDay * workDays;
    return {
      ca,
      covers,
      personnel,
      achats,
      fixes,
      result: ca - achats - personnel - fixes,
      workDays,
      avgDay,
      forecast,
    };
  }, [fs, fi, fc, openingDays, chartMonth, selectedEst, ests]);
  const chartData = useMemo(
    () => buildChartData(chartView, chartMonth, chartYear, fs, fi, fc, fh),
    [chartView, chartMonth, chartYear, fs, fi, fc, fh],
  );
  const sal = salaryCalc(emp),
    activePayroll = fe
      .filter((x) => x.active)
      .reduce((a, x) => a + Number(x.monthly_loaded_cost || 0), 0),
    hoursCost = fh.reduce((a, x) => a + Number(x.loaded_cost || 0), 0),
    hoursTotal = fh.reduce((a, x) => a + Number(x.hours_worked || 0), 0);
  if (user === undefined)
    return (
      <main>
        <section>
          <div className="formCard">
            <h2>Maison Oddos</h2>
            <p>Vérification de votre accès…</p>
          </div>
        </section>
      </main>
    );
  if (!user)
    return (
      <main>
        <section>
          <div
            className="formCard"
            style={{ maxWidth: 460, margin: "70px auto", padding: 28 }}
          >
            <img className="brandLogo" src="/maison-oddos-logo.svg" alt="Maison Oddos Restaurants" />
            <h1>Pilotage Restaurants</h1>
            <form
              onSubmit={login}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <Field label="Adresse e-mail">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Mot de passe">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <button
                disabled={busy}
                style={{ width: "100%", marginTop: 8, padding: 13 }}
              >
                {busy ? "Connexion…" : "Se connecter"}
              </button>
            </form>
            <button onClick={reset} style={{ width: "100%", marginTop: 10 }}>
              Mot de passe oublié
            </button>
            {authMsg && <p>{authMsg}</p>}
          </div>
        </section>
      </main>
    );
  const name = (id) => ests.find((e) => e.id === id)?.name || "—",
    employeeName = (id) => employees.find((e) => e.id === id)?.full_name || "—";
  const archivedZ = (item) =>
    String(item?.z_document_path || "").startsWith("z-reports/");
  async function zDocumentUrl(item) {
    if (!archivedZ(item)) {
      throw new Error("Le PDF original de ce Z n’est pas encore archivé.");
    }

    const { data, error } = await sb.storage
      .from("accounting-documents")
      .createSignedUrl(item.z_document_path, 3600);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Lien du Z indisponible.");
    }

    return data.signedUrl;
  }
  async function viewZDocument(item) {
    setDocumentMsg("");
    setDocumentBusy(true);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await zDocumentUrl(item);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      setDocumentMsg("Erreur : " + error.message);
    } finally {
      setDocumentBusy(false);
    }
  }
  async function emailZDocument(item) {
    const recipient = window.prompt("Adresse e-mail du destinataire :");
    if (!recipient) return;

    setDocumentMsg("");
    setDocumentBusy(true);
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
        body: JSON.stringify({ to: recipient, dailySaleId: item.id }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Envoi impossible.");
      }

      setDocumentMsg(`✓ Rapport Z envoyé à ${recipient}.`);
    } catch (error) {
      setDocumentMsg("Erreur : " + error.message);
    } finally {
      setDocumentBusy(false);
    }
  }
  const EstSelect = ({ value, onChange }) => (
    <select required value={value} onChange={onChange} style={inputStyle}>
      <option value="">Choisir…</option>
      {ests.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
  const formatLocalDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;

  const currentBusinessDate = today();
  const todaySales = fs.filter(
    (item) => String(item.business_date || "").slice(0, 10) === currentBusinessDate,
  );
  const todayCa = todaySales.reduce(
    (sum, item) =>
      sum + Number(item.lunch_sales_ht || 0) + Number(item.dinner_sales_ht || 0),
    0,
  );
  const todayCovers = todaySales.reduce(
    (sum, item) =>
      sum + Number(item.lunch_covers || 0) + Number(item.dinner_covers || 0),
    0,
  );

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const iso = formatLocalDate(date);
    const salesForDay = fs.filter(
      (item) => String(item.business_date || "").slice(0, 10) === iso,
    );
    const invoicesForDay = fi.filter(
      (item) => String(item.invoice_date || "").slice(0, 10) === iso,
    );
    const ca = salesForDay.reduce(
      (sum, item) =>
        sum + Number(item.lunch_sales_ht || 0) + Number(item.dinner_sales_ht || 0),
      0,
    );
    const costs =
      salesForDay.reduce((sum, item) => sum + Number(item.staff_cost || 0), 0) +
      invoicesForDay.reduce(
        (sum, item) =>
          sum +
          (item.document_type === "credit_note" ? -1 : 1) *
            Number(item.amount_ht || 0),
        0,
      );

    return {
      iso,
      label: date
        .toLocaleDateString("fr-FR", { weekday: "short" })
        .replace(".", ""),
      ca: Math.max(0, ca),
      costs: Math.max(0, costs),
    };
  });
  const activityMaximum = Math.max(
    1,
    ...lastSevenDays.flatMap((item) => [item.ca, item.costs]),
  );

  const [selectedYear, selectedMonth] = chartMonth.split("-").map(Number);
  const previousMonthDate = new Date(Date.UTC(selectedYear, selectedMonth - 2, 1));
  const previousMonthKey = `${previousMonthDate.getUTCFullYear()}-${String(
    previousMonthDate.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  const previousMonthCa = fs
    .filter((item) => String(item.business_date || "").startsWith(previousMonthKey))
    .reduce(
      (sum, item) =>
        sum + Number(item.lunch_sales_ht || 0) + Number(item.dinner_sales_ht || 0),
      0,
    );
  const caTrend = previousMonthCa
    ? ((totals.ca - previousMonthCa) / previousMonthCa) * 100
    : null;
  const purchaseRate = totals.ca ? (totals.achats / totals.ca) * 100 : 0;
  const invoicesToReview = fi.filter((item) =>
    ["analyzed", "needs_review", "uncertain"].includes(
      String(item.scan_status || "").toLowerCase(),
    ),
  ).length;
  const zToReview = fs.filter((item) =>
    ["analyzed", "needs_review"].includes(
      String(item.z_scan_status || "").toLowerCase(),
    ),
  ).length;

  const todayLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const dashboardItems = [
    ["direction", "⌂", "Vue d’ensemble"],
    ["personnel", "♙", "Personnel"],
    ["factures", "▤", "Factures & avoirs"],
    ["historique", "Z", "Z"],
    ["evolution-ca", "↗", "Évolution du CA"],
    ["analyse-produits", "◇", "Analyse produits"],
    ["visites-sites", "◫", "Visites site web"],
    ["reservations", "◷", "Réservations"],
    ["demandes-groupes", "◇", "Groupes & privatisation"],
    ["charges", "€", "Charges"],
    ["stocks", "◫", "Stocks"],
    ["bons-cadeaux", "□", "Bons cadeaux · Scan QR"],
    ["saisie", "＋", "Saisie manuelle"],
  ];

  const openDashboardItem = (key) => {
    if (
      [
        "evolution-ca",
        "analyse-produits",
        "reservations",
        "bons-cadeaux",
        "demandes-groupes",
        "visites-sites",
      ].includes(key)
    ) {
      window.location.href = `/${key}`;
      return;
    }

    setTab(key);
    setSaveMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="appShell">
      <aside className="dashboardSidebar">
        <div className="sideBrand">
          <img
            src="/maison-oddos-logo.svg"
            alt="Maison Oddos Restaurants"
          />
          <small>Espace de pilotage</small>
        </div>

        <nav className="dashboard-tabs" aria-label="Rubriques de pilotage">
          {dashboardItems.map(([key, icon, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => openDashboardItem(key)}
            >
              <span className="navIcon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebarFoot">
          <strong>Bruno Oddos</strong>
          <span>Direction Maison Oddos</span>
          <button onClick={logout}>Déconnexion</button>
        </div>
      </aside>

      <main className="dashboardMain">
        <header className="topbar">
          <div>
            <img
              className="mobileLogo"
              src="/maison-oddos-logo.svg"
              alt="Maison Oddos Restaurants"
            />
            <div className="eyebrow">{todayLabel}</div>
            <h1>Bonjour Bruno</h1>
          </div>

          <div className="topbarControls">
            <div className="restaurantSwitch" aria-label="Choisir le restaurant">
              <button
                className={selectedEst === VILLA_ID ? "active" : ""}
                onClick={() => setSelectedEst(VILLA_ID)}
              >
                Villa Valleyre
              </button>
              <button
                className={selectedEst === PARC_ID ? "active" : ""}
                onClick={() => setSelectedEst(PARC_ID)}
              >
                Maison du Parc
              </button>
            </div>
            <div className="avatar" title={user.email}>BO</div>
          </div>
        </header>
      {tab === "direction" && (
        <section className="overviewPage">
          <div className="hero">
            <div>
              <p>
                Chiffre d’affaires du mois ·{" "}
                {name(selectedEst)}
              </p>
              <strong>{euro(totals.ca)}</strong>
            </div>
            <div
              className={`heroTrend ${
                caTrend != null && caTrend < 0 ? "negative" : ""
              }`}
            >
              {caTrend == null
                ? "Mois de référence"
                : `${caTrend >= 0 ? "↗ +" : "↘ "}${caTrend.toLocaleString(
                    "fr-FR",
                    { maximumFractionDigits: 1 },
                  )} % vs mois précédent`}
            </div>
          </div>

          <div className="overviewCards">
            <article className="overviewCard">
              <div className="overviewCardHead">
                <span>CA aujourd’hui</span>
                <span className="metricBadge">
                  {totals.avgDay
                    ? `${((todayCa / totals.avgDay - 1) * 100).toLocaleString(
                        "fr-FR",
                        { maximumFractionDigits: 0, signDisplay: "always" },
                      )} %`
                    : "Aujourd’hui"}
                </span>
              </div>
              <strong>{euro(todayCa)}</strong>
              <small>{todayCovers} couverts</small>
            </article>

            <article className="overviewCard">
              <div className="overviewCardHead">
                <span>Achats HT</span>
                <span className="metricBadge">
                  {purchaseRate.toLocaleString("fr-FR", {
                    maximumFractionDigits: 1,
                  })} %
                </span>
              </div>
              <strong>{euro(totals.achats)}</strong>
              <small>Objectif inférieur à 30 %</small>
            </article>

            <article className="overviewCard">
              <div className="overviewCardHead">
                <span>Résultat estimé</span>
                <span className={`metricBadge ${totals.result < 0 ? "danger" : ""}`}>
                  {totals.result >= 0 ? "Sain" : "À surveiller"}
                </span>
              </div>
              <strong>{euro(totals.result)}</strong>
              <small>Après charges connues</small>
            </article>

            <article className="overviewCard">
              <div className="overviewCardHead">
                <span>Prestations à venir</span>
                <span className="metricBadge">Commercial</span>
              </div>
              <strong>
                {commercialForecast.loading
                  ? "…"
                  : commercialForecast.error
                    ? "—"
                    : euro(commercialForecast.total)}
              </strong>
              <small>
                {commercialForecast.count} prestation
                {commercialForecast.count > 1 ? "s" : ""} confirmée
                {commercialForecast.count > 1 ? "s" : ""}
              </small>
            </article>
          </div>

          <div className="overviewLayout">
            <article className="overviewPanel activityPanel">
              <div className="panelHead">
                <h2>Activité des 7 derniers jours</h2>
                <div className="chartSwitch">
                  <button className="active">CA</button>
                  <button>Coûts</button>
                </div>
              </div>

              <div className="activityChart" aria-label="Activité des sept derniers jours">
                {lastSevenDays.map((item) => (
                  <div className="activityColumn" key={item.iso}>
                    <div className="activityBars">
                      <span
                        className="activityBar salesBar"
                        style={{
                          height: `${Math.max(3, (item.ca / activityMaximum) * 100)}%`,
                        }}
                        title={`CA ${euro(item.ca)}`}
                      />
                      <span
                        className="activityBar costBar"
                        style={{
                          height: `${Math.max(
                            2,
                            (item.costs / activityMaximum) * 100,
                          )}%`,
                        }}
                        title={`Coûts ${euro(item.costs)}`}
                      />
                    </div>
                    <small>{item.label}</small>
                  </div>
                ))}
              </div>

              <div className="chartLegend">
                <span><i className="legendDot salesDot" />CA HT</span>
                <span><i className="legendDot costDot" />Coûts</span>
              </div>
            </article>

            <article className="overviewPanel actionsPanel">
              <div className="panelHead">
                <h2>À traiter</h2>
                <span className="metricBadge">
                  {invoicesToReview + zToReview + 2} actions
                </span>
              </div>

              <div className="actionList">
                <button className="actionItem" onClick={() => openDashboardItem("factures")}>
                  <span className="actionIcon">▤</span>
                  <span>
                    <strong>{invoicesToReview} facture{invoicesToReview > 1 ? "s" : ""} à contrôler</strong>
                    <small>Lectures automatiques à vérifier</small>
                  </span>
                  <b>OUVRIR</b>
                </button>

                <button className="actionItem" onClick={() => openDashboardItem("reservations")}>
                  <span className="actionIcon">◷</span>
                  <span>
                    <strong>Réservations à confirmer</strong>
                    <small>Consulter le planning</small>
                  </span>
                  <b>VOIR</b>
                </button>

                <button className="actionItem" onClick={() => openDashboardItem("historique")}>
                  <span className="actionIcon">!</span>
                  <span>
                    <strong>{zToReview} Z à vérifier</strong>
                    <small>Rapports analysés automatiquement</small>
                  </span>
                  <b>VÉRIFIER</b>
                </button>

                <button className="actionItem" onClick={() => openDashboardItem("demandes-groupes")}>
                  <span className="actionIcon">€</span>
                  <span>
                    <strong>{commercialForecast.count} prestation{commercialForecast.count > 1 ? "s" : ""} à venir</strong>
                    <small>{euro(commercialForecast.total)} vendus</small>
                  </span>
                  <b>DÉTAIL</b>
                </button>
              </div>
            </article>
          </div>

        </section>
      )}
      {tab === "saisie" && (
        <section>
          <div className="formCard" style={{ maxWidth: 760 }}>
            <h2>Saisie manuelle</h2>
            <p>Choisissez le type de saisie :</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => (window.location.href = "/vat?type=z")}
                style={{ padding: "16px 28px", fontSize: 16 }}
              >
                Z CAISSE
              </button>
              <button
                type="button"
                onClick={() => (window.location.href = "/vat?type=invoice")}
                style={{ padding: "16px 28px", fontSize: 16 }}
              >
                FACTURE / AVOIR
              </button>
            </div>
          </div>
        </section>
      )}
      {tab === "personnel" && (
        <section>
          <h2>Personnel</h2>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            {[
              ["salaries", "Salariés"],
              ["heures", "Heures"],
              ["pointeuse", "Pointeuse"],
              ["synthese", "Synthèse"],
            ].map(([k, l]) => (
              <button
                key={k}
                className={personnelView === k ? "active" : ""}
                onClick={() => {
                  setPersonnelView(k);
                  setSaveMsg("");
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {personnelView === "salaries" && (
            <>
              <div className="formCard" style={{ maxWidth: 850 }}>
                <h3>Ajouter un salarié</h3>
                <form onSubmit={saveEmployee}>
                  <div className="grid">
                    <Field label="Établissement">
                      <EstSelect
                        value={emp.establishment_id}
                        onChange={(e) =>
                          setEmp({ ...emp, establishment_id: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Nom et prénom">
                      <input
                        required
                        value={emp.full_name}
                        onChange={(e) =>
                          setEmp({ ...emp, full_name: e.target.value })
                        }
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Poste">
                      <input
                        required
                        placeholder="Chef de partie, serveur…"
                        value={emp.job_title}
                        onChange={(e) =>
                          setEmp({ ...emp, job_title: e.target.value })
                        }
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Date d’entrée">
                      <input
                        type="date"
                        required
                        value={emp.entry_date}
                        onChange={(e) =>
                          setEmp({ ...emp, entry_date: e.target.value })
                        }
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Contrat">
                      <select
                        value={emp.contract_type}
                        onChange={(e) =>
                          setEmp({ ...emp, contract_type: e.target.value })
                        }
                        style={inputStyle}
                      >
                        {[
                          "CDI",
                          "CDD",
                          "Extra",
                          "Apprentissage",
                          "Saisonnier",
                        ].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>
                    <Num
                      label="Heures / semaine"
                      value={emp.weekly_hours}
                      set={(v) => setEmp({ ...emp, weekly_hours: v })}
                    />
                    <Num
                      label="Salaire net mensuel €"
                      value={emp.net_salary}
                      set={(v) => setEmp({ ...emp, net_salary: v })}
                    />
                    <Num
                      label="Charges salariales estimées %"
                      value={emp.employee_charge_rate}
                      set={(v) => setEmp({ ...emp, employee_charge_rate: v })}
                    />
                    <Num
                      label="Charges patronales estimées %"
                      value={emp.employer_charge_rate}
                      set={(v) => setEmp({ ...emp, employer_charge_rate: v })}
                    />
                  </div>
                  <div className="grid">
                    <Card t="Brut estimé" v={euro(sal.brut)} />
                    <Card t="Charges salariales" v={euro(sal.chargesSal)} />
                    <Card t="Charges patronales" v={euro(sal.chargesPat)} />
                    <Card t="Coût employeur / mois" v={euro(sal.cost)} />
                    <Card t="Coût employeur / heure" v={euro(sal.hourly)} />
                  </div>
                  <small>
                    Calcul de pilotage estimatif. Les taux sont modifiables et
                    pourront être remplacés par les valeurs réelles du bulletin.
                  </small>
                  <button
                    disabled={saving}
                    style={{ display: "block", marginTop: 18 }}
                  >
                    Enregistrer le salarié
                  </button>
                </form>
                {saveMsg && <p>{saveMsg}</p>}
              </div>
              <h3>Équipe</h3>
              <Table
                heads={[
                  "Salarié",
                  "Établissement",
                  "Poste",
                  "Entrée",
                  "Contrat",
                  "Net",
                  "Coût employeur",
                  "Coût/h",
                ]}
                rows={fe.map((x) => [
                  x.full_name,
                  name(x.establishment_id),
                  x.job_title,
                  x.entry_date || "—",
                  x.contract_type,
                  euro(x.net_salary),
                  euro(x.monthly_loaded_cost),
                  euro(x.hourly_cost),
                ])}
              />
            </>
          )}
          {personnelView === "pointeuse" && <ClockManager sb={sb} employees={employees} />}
          {personnelView === "heures" && (
            <>
              <div className="formCard" style={{ maxWidth: 700 }}>
                <h3>Saisie des heures</h3>
                <form onSubmit={saveHours}>
                  <Field label="Salarié">
                    <select
                      required
                      value={hour.employee_id}
                      onChange={(e) =>
                        setHour({ ...hour, employee_id: e.target.value })
                      }
                      style={inputStyle}
                    >
                      <option value="">Choisir…</option>
                      {fe
                        .filter((x) => x.active)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.full_name} — {x.job_title}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Date">
                    <input
                      type="date"
                      required
                      value={hour.work_date}
                      onChange={(e) =>
                        setHour({ ...hour, work_date: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </Field>
                  <Num
                    label="Heures travaillées"
                    value={hour.hours_worked}
                    set={(v) => setHour({ ...hour, hours_worked: v })}
                  />
                  <Field label="Note">
                    <input
                      value={hour.note}
                      onChange={(e) =>
                        setHour({ ...hour, note: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </Field>
                  <button disabled={saving}>Enregistrer les heures</button>
                </form>
                {saveMsg && <p>{saveMsg}</p>}
              </div>
              <Table
                heads={["Date", "Salarié", "Heures", "Coût chargé"]}
                rows={fh
                  .slice(0, 40)
                  .map((x) => [
                    x.work_date,
                    employeeName(x.employee_id),
                    x.hours_worked,
                    euro(x.loaded_cost),
                  ])}
              />
            </>
          )}
          {personnelView === "synthese" && (
            <>
              <div className="grid">
                <Card
                  t="Salariés actifs"
                  v={fe.filter((x) => x.active).length}
                />
                <Card t="Coût mensuel théorique" v={euro(activePayroll)} />
                <Card t="Heures saisies" v={hoursTotal.toFixed(1)} />
                <Card t="Coût des heures saisies" v={euro(hoursCost)} />
                <Card
                  t="Personnel / CA"
                  v={
                    totals.ca
                      ? `${((hoursCost / totals.ca) * 100).toFixed(1)} %`
                      : "—"
                  }
                />
                <Card
                  t="Coût personnel / couvert"
                  v={totals.covers ? euro(hoursCost / totals.covers) : "—"}
                />
              </div>
              <p>
                La synthèse utilise les heures réellement saisies pour mesurer
                le poids du personnel dans le chiffre d’affaires.
              </p>
            </>
          )}
        </section>
      )}
      {tab === "factures" && (
        <section>
          <h2>Factures et avoirs fournisseurs</h2>
          <p>
            <a href="/factures">
              <button>Gérer les documents</button>
            </a>
          </p>
          <Table
            rows={fi.slice(0, 20).map((x) => {
              const documentSign = x.document_type === "credit_note" ? -1 : 1;
              return [
                x.invoice_date,
                x.document_type === "credit_note" ? "Avoir" : "Facture",
                name(x.establishment_id),
                x.supplier,
                x.category,
                euro(documentSign * Number(x.amount_ht || 0)),
                euro(
                  documentSign *
                    (Number(x.amount_ht || 0) + Number(x.vat_amount || 0)),
                ),
              ];
            })}
            heads={[
              "Date",
              "Type",
              "Établissement",
              "Fournisseur",
              "Catégorie",
              "HT",
              "TTC",
            ]}
          />
        </section>
      )}
      {tab === "stocks" && (
        <section>
          <div className="formCard">
            <h2>Stocks & inventaires</h2>
            <p>
              Alimentaire, Boissons et Entretien : stock début, achats du mois,
              stock fin et consommation réelle.
            </p>
            <p>
              Le stock de fin est repris automatiquement comme stock de début du
              mois suivant.
            </p>
            <a href="/stocks">
              <button style={{ marginTop: 10, padding: 13 }}>
                Ouvrir la gestion détaillée des stocks
              </button>
            </a>
          </div>
        </section>
      )}
      {tab === "charges" && (
        <section>
          <div className="formCard" style={{ maxWidth: 820 }}>
            <h2>Charges fixes & programmées</h2>
            <form onSubmit={saveCharge}>
              <Field label="Restaurant">
                <EstSelect
                  value={charge.establishment_id}
                  onChange={(e) =>
                    setCharge({ ...charge, establishment_id: e.target.value })
                  }
                />
              </Field>
              <div className="grid">
                <Field label="Catégorie">
                  <select
                    value={charge.category}
                    onChange={(e) =>
                      setCharge({ ...charge, category: e.target.value })
                    }
                    style={inputStyle}
                  >
                    {[
                      "Loyer",
                      "Crédit",
                      "Crédit-bail",
                      "Location-gérance",
                      "Énergie",
                      "Assurances",
                      "Comptable",
                      "Logiciels",
                      "Communication",
                      "Entretien",
                      "Autres",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Libellé">
                  <input
                    value={charge.label}
                    onChange={(e) =>
                      setCharge({ ...charge, label: e.target.value })
                    }
                    style={inputStyle}
                  />
                </Field>
                <Num
                  label="Montant HT mensuel"
                  value={charge.amount}
                  set={(v) => setCharge({ ...charge, amount: v })}
                />
                <Num
                  label="Taux TVA %"
                  value={charge.vat_rate}
                  set={(v) => setCharge({ ...charge, vat_rate: v })}
                />
                <Field label="Début">
                  <input
                    type="month"
                    required
                    value={charge.month}
                    onChange={(e) =>
                      setCharge({ ...charge, month: e.target.value })
                    }
                    style={inputStyle}
                  />
                </Field>
              </div>
              <label style={{ display: "block", marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={charge.recurring}
                  onChange={(e) =>
                    setCharge({ ...charge, recurring: e.target.checked })
                  }
                />{" "}
                Programmer automatiquement chaque mois
              </label>
              {charge.recurring && (
                <Field label="Fin (laisser vide = sans date de fin)">
                  <input
                    type="month"
                    value={charge.end_month}
                    min={charge.month}
                    onChange={(e) =>
                      setCharge({ ...charge, end_month: e.target.value })
                    }
                    style={inputStyle}
                  />
                </Field>
              )}
              <button disabled={saving} style={{ marginTop: 18 }}>
                {charge.id
                  ? "Enregistrer les modifications"
                  : "Enregistrer la charge"}
              </button>
              {charge.id && (
                <button
                  type="button"
                  onClick={() =>
                    setCharge((v) => ({
                      ...v,
                      id: null,
                      label: "",
                      amount: "",
                      end_month: "",
                    }))
                  }
                  style={{ marginTop: 10 }}
                >
                  Annuler la modification
                </button>
              )}
              {saveMsg && <p>{saveMsg}</p>}
            </form>
          </div>
          <h3>Charges enregistrées</h3>
          <Table
            rows={fc.slice(0, 30).map((x) => [
              x.month,
              name(x.establishment_id),
              x.category,
              x.label,
              euro(x.amount),
              Number(x.amount || 0) > 0
                ? (
                    ((Number(x.amount_ttc ?? x.amount) - Number(x.amount)) /
                      Number(x.amount)) *
                    100
                  ).toFixed(2) + " %"
                : "0 %",
              euro(x.amount_ttc ?? x.amount),
              x.recurring
                ? x.end_month
                  ? "Mensuelle jusqu’au " + x.end_month
                  : "Mensuelle sans fin"
                : "Ponctuelle",
              <div key={x.id} style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() =>
                    setCharge({
                      id: x.id,
                      establishment_id: x.establishment_id,
                      month: String(x.month || "").slice(0, 7),
                      category: x.category || "Loyer",
                      label: x.label || "",
                      amount: String(x.amount ?? ""),
                      vat_rate: String(
                        Number(x.amount || 0) > 0
                          ? (
                              ((Number(x.amount_ttc ?? x.amount) -
                                Number(x.amount)) /
                                Number(x.amount)) *
                              100
                            ).toFixed(2)
                          : "",
                      ),
                      recurring: !!x.recurring,
                      end_month: x.end_month
                        ? String(x.end_month).slice(0, 7)
                        : "",
                    })
                  }
                >
                  Modifier
                </button>
                <button type="button" onClick={() => deleteCharge(x.id)}>
                  Supprimer
                </button>
              </div>,
            ])}
            heads={[
              "Début",
              "Établissement",
              "Catégorie",
              "Libellé",
              "Montant HT",
              "TVA",
              "Montant TTC",
              "Programmation",
              "Actions",
            ]}
          />
        </section>
      )}
      {tab === "historique" && (
        <section>
          <h2>Historique des Z</h2>
          {documentMsg && (
            <p>
              <b>{documentMsg}</b>
            </p>
          )}
          <Table
            rows={fs.map((x) => [
              x.business_date,
              name(x.establishment_id),
              euro(
                Number(x.lunch_sales_ht || 0) + Number(x.dinner_sales_ht || 0),
              ),
              Number(x.lunch_covers || 0) + Number(x.dinner_covers || 0),
              x.z_scan_status || "manual",
              archivedZ(x) ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={() => viewZDocument(x)}
                    disabled={documentBusy}
                  >
                    Voir le PDF
                  </button>
                  <button
                    onClick={() => emailZDocument(x)}
                    disabled={documentBusy}
                  >
                    Envoyer par e-mail
                  </button>
                </div>
              ) : (
                "—"
              ),
            ])}
            heads={[
              "Date",
              "Établissement",
              "CA HT",
              "Couverts",
              "Origine",
              "Document Z",
            ]}
          />
        </section>
      )}
      </main>

      <nav className="mobileNav" aria-label="Navigation mobile">
        {dashboardItems
          .filter(([key]) =>
            ["direction", "personnel", "factures", "historique", "evolution-ca"].includes(key),
          )
          .map(([key, icon, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => openDashboardItem(key)}
            >
              <span>{icon}</span>
              {key === "direction" ? "Accueil" : label.split(" ")[0]}
            </button>
          ))}
      </nav>
    </div>
  );
}
function buildChartData(view, month, year, sales, invoices, charges, hours) {
  if (view === "month") {
    const [y, m] = month.split("-").map(Number),
      days = new Date(y, m, 0).getDate(),
      rows = Array.from({ length: days }, (_, i) => ({
        label: String(i + 1),
        ca: 0,
        charges: 0,
      }));
    sales
      .filter((x) => x.business_date?.startsWith(month))
      .forEach(
        (x) =>
          (rows[Number(x.business_date.slice(8, 10)) - 1].ca +=
            Number(x.lunch_sales_ht || 0) + Number(x.dinner_sales_ht || 0)),
      );
    invoices
      .filter((x) => x.invoice_date?.startsWith(month))
      .forEach(
        (x) =>
          (rows[Number(x.invoice_date.slice(8, 10)) - 1].charges +=
            (x.document_type === "credit_note" ? -1 : 1) *
            Number(x.amount_ht || 0)),
      );
    hours
      .filter((x) => x.work_date?.startsWith(month))
      .forEach(
        (x) =>
          (rows[Number(x.work_date.slice(8, 10)) - 1].charges += Number(
            x.loaded_cost || 0,
          )),
      );
    const fixed = charges
      .filter((x) => String(x.month || "").startsWith(month))
      .reduce((a, x) => a + Number(x.amount || 0), 0);
    if (rows.length) rows[0].charges += fixed;
    let ca = 0,
      ch = 0;
    return rows.map((r) => {
      ca += r.ca;
      ch += r.charges;
      return { ...r, ca, charges: ch, gap: ca - ch };
    });
  }
  const names = [
      "Jan",
      "Fév",
      "Mar",
      "Avr",
      "Mai",
      "Juin",
      "Juil",
      "Août",
      "Sep",
      "Oct",
      "Nov",
      "Déc",
    ],
    rows = names.map((label) => ({ label, ca: 0, charges: 0 }));
  sales
    .filter((x) => x.business_date?.startsWith(year + "-"))
    .forEach(
      (x) =>
        (rows[Number(x.business_date.slice(5, 7)) - 1].ca +=
          Number(x.lunch_sales_ht || 0) + Number(x.dinner_sales_ht || 0)),
    );
  invoices
    .filter((x) => x.invoice_date?.startsWith(year + "-"))
    .forEach(
      (x) =>
        (rows[Number(x.invoice_date.slice(5, 7)) - 1].charges +=
          (x.document_type === "credit_note" ? -1 : 1) *
          Number(x.amount_ht || 0)),
    );
  hours
    .filter((x) => x.work_date?.startsWith(year + "-"))
    .forEach(
      (x) =>
        (rows[Number(x.work_date.slice(5, 7)) - 1].charges += Number(
          x.loaded_cost || 0,
        )),
    );
  charges
    .filter((x) => String(x.month || "").startsWith(year + "-"))
    .forEach((x) => {
      const m = Number(String(x.month).slice(5, 7));
      if (m) rows[m - 1].charges += Number(x.amount || 0);
    });
  return rows.map((r) => ({ ...r, gap: r.ca - r.charges }));
}
function TrendChart({ data }) {
  const W = 900,
    H = 300,
    p = 42,
    max = Math.max(
      1,
      ...data.flatMap((x) => [x.ca, x.charges, Math.max(0, x.gap)]),
    ),
    x = (i) => p + (i * (W - 2 * p)) / Math.max(1, data.length - 1),
    y = (v) => H - p - (Number(v || 0) / max) * (H - 2 * p),
    path = (k) =>
      data.map((d, i) => (i ? "L" : "M") + x(i) + " " + y(d[k])).join(" ");
  return (
    <div style={{ overflowX: "auto", marginTop: 18 }}>
      <div style={{ minWidth: 700 }}>
        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          <b>CA HT</b>
          <span>Charges totales</span>
          <span>Écart CA − charges</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{
            width: "100%",
            height: 300,
            background: "#fff",
            borderRadius: 10,
          }}
        >
          <line
            x1={p}
            y1={H - p}
            x2={W - p}
            y2={H - p}
            stroke="currentColor"
            opacity=".18"
          />
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line
                x1={p}
                y1={y(max * v)}
                x2={W - p}
                y2={y(max * v)}
                stroke="currentColor"
                opacity=".08"
              />
              <text x={4} y={y(max * v) + 4} fontSize="11">
                {Math.round((max * v) / 1000)}k
              </text>
            </g>
          ))}
          <path
            d={path("ca")}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            d={path("charges")}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="9 6"
            opacity=".7"
          />
          <path
            d={path("gap")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="2 6"
            opacity=".45"
          />
          {data.map((d, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(d.ca)} r="3" fill="currentColor">
                <title>{`${d.label} — CA ${euro(d.ca)} | Charges ${euro(d.charges)} | Écart ${euro(d.gap)}`}</title>
              </circle>
              {(data.length <= 12 || i % 3 === 0 || i === data.length - 1) && (
                <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11">
                  {d.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label style={{ display: "block", fontWeight: 700, marginTop: 14 }}>
      {label}
      {children}
    </label>
  );
}
function Num({ label, value, set }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => set(e.target.value)}
        style={inputStyle}
      />
    </Field>
  );
}
function Card({ t, v }) {
  return (
    <article className="card">
      <span>{t}</span>
      <strong>{v}</strong>
    </article>
  );
}
function Table({ heads, rows }) {
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={heads.length}>Aucune donnée pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
