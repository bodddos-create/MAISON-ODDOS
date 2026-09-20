"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);
const statusLabels = {
  pending: "À confirmer",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  no_show: "Absent",
  completed: "Terminée",
};

export default function ReservationsAdmin() {
  const [user, setUser] = useState(undefined);
  const [reservations, setReservations] = useState([]);
  const [establishments, setEstablishments] = useState([]);
  const [filter, setFilter] = useState("upcoming");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: rows, error }, { data: ests }] = await Promise.all([
      sb
        .from("reservations")
        .select("*")
        .order("reservation_date", { ascending: true })
        .order("reservation_time", { ascending: true }),
      sb.from("establishments").select("id,name").eq("active", true),
    ]);
    if (error) setMessage(`Erreur : ${error.message}`);
    setReservations(rows || []);
    setEstablishments(ests || []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  const names = useMemo(
    () => Object.fromEntries(establishments.map((item) => [item.id, item.name])),
    [establishments],
  );
  const today = new Date().toISOString().slice(0, 10);
  const visible = reservations.filter((reservation) => {
    if (filter === "pending") return reservation.status === "pending";
    if (filter === "upcoming") {
      return reservation.reservation_date >= today && reservation.status !== "cancelled";
    }
    return true;
  });

  async function changeStatus(id, status) {
    setMessage("");
    const { error } = await sb
      .from("reservations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return setMessage(`Erreur : ${error.message}`);
    setReservations((items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setMessage("Réservation mise à jour.");
  }

  if (user === undefined || (user && loading)) {
    return <main><section><p>Chargement des réservations…</p></section></main>;
  }
  if (!user) {
    return (
      <main><section><h2>Accès protégé</h2><p>Connectez-vous d’abord à Maison Oddos.</p><a href="/"><button>Retour à la connexion</button></a></section></main>
    );
  }

  const pendingCount = reservations.filter((item) => item.status === "pending").length;
  const confirmedCount = reservations.filter(
    (item) => item.status === "confirmed" && item.reservation_date >= today,
  ).length;
  const upcomingCovers = reservations
    .filter((item) => item.status === "confirmed" && item.reservation_date >= today)
    .reduce((sum, item) => sum + Number(item.party_size || 0), 0);

  return (
    <main>
      <header>
        <div><div className="brand">MAISON ODDOS</div><h1>Réservations</h1></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/reservation" target="_blank"><button className="secondary">Page client ↗</button></a>
          <a href="/"><button>← Pilotage</button></a>
        </div>
      </header>
      <section>
        <div className="grid">
          <article className="card"><span>À confirmer</span><strong>{pendingCount}</strong></article>
          <article className="card"><span>Confirmées à venir</span><strong>{confirmedCount}</strong></article>
          <article className="card"><span>Couverts confirmés à venir</span><strong>{upcomingCovers}</strong></article>
        </div>
        <div className="reservationFilters">
          {[["upcoming", "À venir"], ["pending", "À confirmer"], ["all", "Toutes"]].map(([value, label]) => (
            <button key={value} className={filter === value ? "active" : "secondary"} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        {message && <p className="message">{message}</p>}
        {!visible.length ? (
          <div className="formCard"><p>Aucune réservation dans cette vue.</p></div>
        ) : (
          <div className="reservationList">
            {visible.map((reservation) => (
              <article className="reservationCard" key={reservation.id}>
                <div className="reservationDate">
                  <strong>{new Date(`${reservation.reservation_date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</strong>
                  <span>{String(reservation.reservation_time).slice(0, 5)}</span>
                </div>
                <div className="reservationIdentity">
                  <span className={`status status-${reservation.status}`}>{statusLabels[reservation.status]}</span>
                  <h3>{reservation.customer_name} · {reservation.party_size} pers.</h3>
                  <p><b>{names[reservation.establishment_id] || "Restaurant"}</b></p>
                  <p>{reservation.phone}{reservation.email ? ` · ${reservation.email}` : ""}</p>
                  {reservation.notes && <small>{reservation.notes}</small>}
                </div>
                <div className="reservationActions">
                  <button onClick={() => changeStatus(reservation.id, "confirmed")}>Confirmer</button>
                  <button className="secondary" onClick={() => changeStatus(reservation.id, "cancelled")}>Annuler</button>
                  <select value={reservation.status} onChange={(event) => changeStatus(reservation.id, event.target.value)}>
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
