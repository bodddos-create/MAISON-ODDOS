"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);
const COLORS = ["#185c2b", "#2474d8", "#e62b26", "#f39a0a"];
const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
const money = (value) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
const percent = (value) =>
  Number.isFinite(value)
    ? `${value >= 0 ? "+" : ""}${value.toLocaleString("fr-FR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} %`
    : "—";

async function fetchAll(table, select, order) {
  const all = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .order(order, { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return all;
}

function periodDates(reference, mode) {
  const start =
    mode === "month"
      ? new Date(reference.getFullYear(), reference.getMonth(), 1)
      : new Date(reference.getFullYear(), 0, 1);
  const dates = [];

  for (
    const date = new Date(start);
    date <= reference;
    date.setDate(date.getDate() + 1)
  ) {
    dates.push(
      `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    );
  }

  return dates;
}

function ComparisonChart({ years, series, labels }) {
  const width = 920;
  const height = 360;
  const left = 70;
  const right = 24;
  const top = 28;
  const bottom = 48;
  const max = Math.max(1, ...years.flatMap((year) => series[year] || []));
  const x = (index) =>
    left + (index * (width - left - right)) / Math.max(1, labels.length - 1);
  const y = (value) =>
    height - bottom - (Number(value || 0) / max) * (height - top - bottom);
  const path = (values) =>
    values
      .map(
        (value, index) =>
          `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`,
      )
      .join(" ");
  const labelIndexes = [
    ...new Set([
      0,
      Math.floor((labels.length - 1) / 3),
      Math.floor(((labels.length - 1) * 2) / 3),
      labels.length - 1,
    ]),
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 720 }}>
        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            justifyContent: "center",
            marginBottom: 10,
            fontWeight: 800,
          }}
        >
          {years.map((year, index) => (
            <span key={year} style={{ color: COLORS[index] }}>
              ● {index === 0 ? "N" : `N−${index}`} · {year}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: 360, background: "#fff" }}
          aria-label="Comparaison du chiffre d’affaires cumulé"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = max * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={left}
                  y1={y(value)}
                  x2={width - right}
                  y2={y(value)}
                  stroke="#dfe3dd"
                />
                <text x="4" y={y(value) + 4} fontSize="11" fill="#5f665e">
                  {money(value)}
                </text>
              </g>
            );
          })}
          {years.map((year, index) => (
            <path
              key={year}
              d={path(series[year])}
              fill="none"
              stroke={COLORS[index]}
              strokeWidth={index === 0 ? 5 : 3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {labelIndexes.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={height - 15}
              textAnchor="middle"
              fontSize="12"
              fill="#5f665e"
            >
              {labels[index]}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function EvolutionCA() {
  const [user, setUser] = useState(undefined);
  const [establishments, setEstablishments] = useState([]);
  const [sales, setSales] = useState([]);
  const [vatLines, setVatLines] = useState([]);
  const [historical, setHistorical] = useState([]);
  const [selectedEstablishment, setSelectedEstablishment] = useState("all");
  const [mode, setMode] = useState("year");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reference = useMemo(() => new Date(), []);
  const currentYear = reference.getFullYear();
  const years = [
    currentYear,
    currentYear - 1,
    currentYear - 2,
    currentYear - 3,
  ];

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([
      sb.from("establishments").select("id,name").eq("active", true),
      fetchAll(
        "daily_sales",
        "id,establishment_id,business_date,lunch_sales_ht,dinner_sales_ht,lunch_covers,dinner_covers",
        "business_date",
      ),
      fetchAll(
        "daily_sale_vat_lines",
        "daily_sale_id,amount_ttc",
        "daily_sale_id",
      ),
      fetchAll(
        "historical_ca",
        "id,establishment_id,period_start,period_type,amount_ttc,covers,source_filename",
        "period_start",
      ),
    ])
      .then(([establishmentResult, saleRows, vatRows, historicalRows]) => {
        if (!active) return;
        if (establishmentResult.error) throw establishmentResult.error;
        setEstablishments(establishmentResult.data || []);
        setSales(saleRows);
        setVatLines(vatRows);
        setHistorical(historicalRows);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Chargement impossible");
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [user]);

  const report = useMemo(() => {
    const vatBySale = {};
    vatLines.forEach((line) => {
      vatBySale[line.daily_sale_id] =
        (vatBySale[line.daily_sale_id] || 0) + Number(line.amount_ttc || 0);
    });
    const liveRows = sales
      .filter(
        (sale) =>
          selectedEstablishment === "all" ||
          sale.establishment_id === selectedEstablishment,
      )
      .map((sale) => {
        const ht =
          Number(sale.lunch_sales_ht || 0) + Number(sale.dinner_sales_ht || 0);
        return {
          ...sale,
          ca: Object.prototype.hasOwnProperty.call(vatBySale, sale.id)
            ? vatBySale[sale.id]
            : ht,
          covers:
            Number(sale.lunch_covers || 0) + Number(sale.dinner_covers || 0),
        };
      });
    const historyRows = historical.filter(
      (row) =>
        selectedEstablishment === "all" ||
        row.establishment_id === selectedEstablishment,
    );
    const liveKeys = new Set(
      liveRows.map(
        (row) => `${row.establishment_id}|${String(row.business_date).slice(0, 10)}`,
      ),
    );
    const historicalDays = historyRows
      .filter((row) => row.period_type === "day")
      .filter(
        (row) =>
          !liveKeys.has(
            `${row.establishment_id}|${String(row.period_start).slice(0, 10)}`,
          ),
      )
      .map((row) => ({
        id: `history-${row.id}`,
        establishment_id: row.establishment_id,
        business_date: row.period_start,
        ca: Number(row.amount_ttc || 0),
        covers: Number(row.covers || 0),
        historical: true,
      }));
    const monthlyHistory = historyRows
      .filter(
        (row) =>
          row.period_type === "month" &&
          Number(String(row.period_start).slice(0, 4)) < currentYear,
      )
      .map((row) => ({
        id: `history-${row.id}`,
        establishment_id: row.establishment_id,
        business_date: row.period_start,
        ca: Number(row.amount_ttc || 0),
        covers: Number(row.covers || 0),
        historical: true,
        historicalMonth: true,
      }));
    const monthlyKeys = new Set(
      monthlyHistory.map(
        (row) =>
          `${row.establishment_id}|${String(row.business_date).slice(0, 7)}`,
      ),
    );
    const normalized = [...liveRows, ...historicalDays]
      .filter(
        (row) =>
          !monthlyKeys.has(
            `${row.establishment_id}|${String(row.business_date).slice(0, 7)}`,
          ),
      )
      .concat(monthlyHistory);
    const annualTotals = {};
    historyRows
      .filter((row) => row.period_type === "year")
      .forEach((row) => {
        const year = Number(String(row.period_start).slice(0, 4));
        annualTotals[year] =
          (annualTotals[year] || 0) + Number(row.amount_ttc || 0);
      });
    const labels = periodDates(reference, mode);
    const stats = {};
    const series = {};

    years.forEach((year) => {
      const amountByDay = {};
      const yearRows = normalized.filter((sale) => {
        const date = String(sale.business_date || "");
        if (!date.startsWith(`${year}-`)) return false;
        const monthDay = date.slice(5, 10);
        if (
          mode === "month" &&
          monthDay.slice(0, 2) !== labels[0]?.slice(0, 2)
        ) {
          return false;
        }
        return labels.includes(monthDay);
      });

      yearRows.forEach((sale) => {
        const monthDay = String(sale.business_date).slice(5, 10);
        amountByDay[monthDay] = (amountByDay[monthDay] || 0) + sale.ca;
      });

      let cumulative = 0;
      series[year] = labels.map((label) => {
        cumulative += amountByDay[label] || 0;
        return cumulative;
      });
      const covers = yearRows.reduce((sum, sale) => sum + sale.covers, 0);
      const openUnits = new Set(
        yearRows
          .filter((sale) => sale.ca > 0)
          .map((sale) => `${sale.establishment_id}|${sale.business_date}`),
      ).size;
      stats[year] = {
        ca: cumulative,
        covers,
        openUnits,
        average: openUnits ? cumulative / openUnits : 0,
        ticket: covers ? cumulative / covers : 0,
      };
    });

    const monthly = MONTHS.map((month, monthIndex) => {
      const values = {};
      years.forEach((year) => {
        if (monthIndex > reference.getMonth()) {
          values[year] = null;
          return;
        }
        values[year] = normalized
          .filter((sale) => {
            const date = String(sale.business_date || "");
            if (
              !date.startsWith(
                `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
              )
            ) {
              return false;
            }
            return (
              monthIndex < reference.getMonth() ||
              Number(date.slice(8, 10)) <= reference.getDate()
            );
          })
          .reduce((sum, sale) => sum + sale.ca, 0);
      });
      return { month, values };
    });

    const priorFull = normalized
      .filter((sale) =>
        String(sale.business_date || "").startsWith(`${currentYear - 1}-`),
      )
      .reduce((sum, sale) => sum + sale.ca, 0);
    const projection =
      mode === "year" && stats[currentYear - 1].ca > 0 && priorFull > 0
        ? stats[currentYear].ca * (priorFull / stats[currentYear - 1].ca)
        : null;

    return { labels, stats, series, monthly, projection, annualTotals };
  }, [
    sales,
    vatLines,
    historical,
    selectedEstablishment,
    mode,
    reference,
    currentYear,
  ]);

  if (user === undefined || (user && loading)) {
    return (
      <main>
        <section>
          <p>Chargement du comparatif…</p>
        </section>
      </main>
    );
  }

  if (!user) {
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
  }

  const current = report.stats[currentYear];
  const previous = report.stats[currentYear - 1];
  const gap = current.ca - previous.ca;
  const rate = previous.ca ? (gap / previous.ca) * 100 : null;

  return (
    <main>
      <header>
        <div>
          <div className="brand">MAISON ODDOS</div>
          <h1>Évolution du chiffre d’affaires</h1>
        </div>

        <a href="/">
          <button>← Pilotage</button>
        </a>
      </header>
      <section>
        <div className="formCard" style={{ marginBottom: 22 }}>
          <div className="grid">
            <label>
              Établissement
              <select
                value={selectedEstablishment}
                onChange={(event) =>
                  setSelectedEstablishment(event.target.value)
                }
                style={{ width: "100%", padding: 11, marginTop: 6 }}
              >
                <option value="all">CONSOLIDÉ — Tous les établissements</option>
                {establishments.map((establishment) => (
                  <option key={establishment.id} value={establishment.id}>
                    {establishment.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            <button
              className={mode === "year" ? "active" : ""}
              onClick={() => setMode("year")}
            >
              Cumul annuel à date
            </button>
            <button
              className={mode === "month" ? "active" : ""}
              onClick={() => setMode("month")}
            >
              Mois en cours
            </button>
          </div>
        </div>

        {error && (
          <p>
            <b>Erreur : {error}</b>
          </p>
        )}

        <div className="hero">
          <div>
            <span>
              CA TTC {mode === "year" ? "cumulé à date" : "du mois à date"}
            </span>
            <h2>{money(current.ca)}</h2>
            <small>
              Comparaison arrêtée au {reference.toLocaleDateString("fr-FR")}
            </small>
          </div>
          <div className="result">
            <span>Écart N / N−1</span>
            <strong>{previous.ca ? percent(rate) : "—"}</strong>
            <small>
              {previous.ca
                ? `${gap >= 0 ? "+" : ""}${money(gap)}`
                : "Historique absent"}
            </small>
          </div>
        </div>

        <div className="grid">
          <article className="card">
            <span>CA moyen / jour d’ouverture</span>
            <strong>{money(current.average)}</strong>
          </article>
          <article className="card">
            <span>Couverts</span>
            <strong>{current.covers.toLocaleString("fr-FR")}</strong>
          </article>
          <article className="card">
            <span>Ticket moyen TTC</span>
            <strong>{money(current.ticket)}</strong>
          </article>
          <article className="card">
            <span>Projection fin d’année</span>
            <strong>
              {report.projection ? money(report.projection) : "—"}
            </strong>
            <small>Selon la saisonnalité de N−1</small>
          </article>
        </div>

        <div className="formCard" style={{ marginTop: 22 }}>
          <h2>Courbes cumulées N à N−3</h2>
          <ComparisonChart
            years={years}
            series={report.series}
            labels={report.labels}
          />
        </div>

        <h2 style={{ marginTop: 28 }}>Synthèse des quatre années</h2>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Année</th>
                <th>CA TTC</th>
                <th>Évolution</th>
                <th>Écart</th>
                <th>Jours d’ouverture</th>
                <th>Couverts</th>
                <th>Ticket moyen</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year, index) => {
                const value = report.stats[year];
                const comparison = report.stats[year - 1];
                const difference = value.ca - comparison?.ca;
                const evolution = comparison?.ca
                  ? (difference / comparison.ca) * 100
                  : null;
                return (
                  <tr key={year}>
                    <td>
                      <b>
                        {index === 0 ? "N" : `N−${index}`} · {year}
                      </b>
                    </td>
                    <td>{value.ca ? money(value.ca) : "—"}</td>
                    <td>{percent(evolution)}</td>
                    <td>
                      {comparison?.ca
                        ? `${difference >= 0 ? "+" : ""}${money(difference)}`
                        : "—"}
                    </td>
                    <td>{value.openUnits || "—"}</td>
                    <td>
                      {value.covers
                        ? value.covers.toLocaleString("fr-FR")
                        : "—"}
                    </td>
                    <td>{value.ticket ? money(value.ticket) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h2 style={{ marginTop: 28 }}>Clôtures annuelles importées</h2>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Année</th>
                <th>CA TTC annuel</th>
                <th>Évolution annuelle</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year, index) => {
                const value = report.annualTotals[year] || 0;
                const previousAnnual = report.annualTotals[year - 1] || 0;
                const annualRate = previousAnnual
                  ? ((value - previousAnnual) / previousAnnual) * 100
                  : null;
                return (
                  <tr key={year}>
                    <td>
                      <b>
                        {index === 0 ? "N" : `N−${index}`} · {year}
                      </b>
                    </td>
                    <td>{value ? money(value) : "—"}</td>
                    <td>{value ? percent(annualRate) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {mode === "year" && (
          <>
            <h2 style={{ marginTop: 28 }}>Détail mensuel à date comparable</h2>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Mois</th>
                    {years.map((year, index) => (
                      <th key={year}>
                        {index === 0 ? "N" : `N−${index}`} · {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.monthly.map((row) => (
                    <tr key={row.month}>
                      <td>
                        <b>{row.month}</b>
                      </td>
                      {years.map((year) => (
                        <td key={year}>
                          {row.values[year] == null
                            ? "—"
                            : row.values[year]
                              ? money(row.values[year])
                              : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p style={{ marginTop: 20 }}>
          <small>
            Le CA TTC provient des ventilations TVA des Z. Lorsqu’une ancienne
            journée ne possède pas de ventilation TVA, le montant saisi est
            utilisé. Les récapitulatifs historiques envoyés par e-mail
            complètent automatiquement les années précédentes sans créer de
            faux Z journalier.
          </small>
        </p>
      </section>
    </main>
  );
}
