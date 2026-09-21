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
const dayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const serviceLabels = ["Déjeuner", "Dîner"];
const timeValue = (value) => String(value || "").slice(0, 5);

export default function ReservationsAdmin() {
  const [user, setUser] = useState(undefined);
  const [reservations, setReservations] = useState([]);
  const [establishments, setEstablishments] = useState([]);
  const [services, setServices] = useState([]);
  const [settings, setSettings] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [view, setView] = useState("reservations");
  const [selectedEstablishment, setSelectedEstablishment] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closure, setClosure] = useState({ exception_date: "", note: "" });

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  async function load() {
    setLoading(true);
    const results = await Promise.all([
      sb.from("reservations").select("*").order("reservation_date", { ascending: true }).order("reservation_time", { ascending: true }),
      sb.from("establishments").select("id,name").eq("active", true).order("name"),
      sb.from("reservation_services").select("*").order("weekday").order("start_time"),
      sb.from("reservation_settings").select("*"),
      sb.from("reservation_exceptions").select("*").order("exception_date"),
    ]);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) setMessage(`Erreur : ${firstError.message}`);
    setReservations(results[0].data || []);
    setEstablishments(results[1].data || []);
    setServices(results[2].data || []);
    setSettings(results[3].data || []);
    setExceptions(results[4].data || []);
    setSelectedEstablishment((current) => current || results[1].data?.[0]?.id || "");
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
    if (filter === "upcoming") return reservation.reservation_date >= today && reservation.status !== "cancelled";
    return true;
  });
  const selectedSetting = settings.find((item) => item.establishment_id === selectedEstablishment) || {
    establishment_id: selectedEstablishment,
    online_enabled: true,
    booking_days_ahead: 180,
  };
  const selectedServices = services.filter((item) => item.establishment_id === selectedEstablishment);
  const selectedExceptions = exceptions.filter((item) => item.establishment_id === selectedEstablishment);

  async function changeStatus(id, status) {
    setMessage("");
    const { error } = await sb.from("reservations").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return setMessage(`Erreur : ${error.message}`);
    setReservations((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    setMessage("Réservation mise à jour.");
  }

  function changeSetting(field, value) {
    setSettings((items) => {
      const exists = items.some((item) => item.establishment_id === selectedEstablishment);
      if (!exists) return [...items, { ...selectedSetting, [field]: value }];
      return items.map((item) => item.establishment_id === selectedEstablishment ? { ...item, [field]: value } : item);
    });
  }

  function changeService(id, field, value) {
    setServices((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  async function saveSchedule() {
    setSaving(true);
    setMessage("");
    const settingPayload = {
      establishment_id: selectedEstablishment,
      online_enabled: Boolean(selectedSetting.online_enabled),
      booking_days_ahead: Number(selectedSetting.booking_days_ahead || 180),
      updated_at: new Date().toISOString(),
    };
    const servicePayload = selectedServices.map((item) => ({
      id: item.id,
      establishment_id: item.establishment_id,
      weekday: Number(item.weekday),
      label: item.label,
      start_time: timeValue(item.start_time),
      end_time: timeValue(item.end_time),
      slot_interval: Number(item.slot_interval),
      max_party_size: Number(item.max_party_size),
      active: Boolean(item.active),
      updated_at: new Date().toISOString(),
    }));
    const [{ error: settingError }, { error: servicesError }] = await Promise.all([
      sb.from("reservation_settings").upsert(settingPayload, { onConflict: "establishment_id" }),
      sb.from("reservation_services").upsert(servicePayload, { onConflict: "id" }),
    ]);
    setSaving(false);
    const error = settingError || servicesError;
    if (error) return setMessage(`Erreur : ${error.message}`);
    setMessage(`Horaires de ${names[selectedEstablishment]} enregistrés.`);
  }

  async function addClosure(event) {
    event.preventDefault();
    setMessage("");
    if (!closure.exception_date) return;
    const { data, error } = await sb.from("reservation_exceptions").upsert({
      establishment_id: selectedEstablishment,
      exception_date: closure.exception_date,
      is_closed: true,
      note: closure.note.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "establishment_id,exception_date" }).select().single();
    if (error) return setMessage(`Erreur : ${error.message}`);
    setExceptions((items) => [...items.filter((item) => item.id !== data.id && !(item.establishment_id === data.establishment_id && item.exception_date === data.exception_date)), data].sort((a, b) => a.exception_date.localeCompare(b.exception_date)));
    setClosure({ exception_date: "", note: "" });
    setMessage("Fermeture exceptionnelle ajoutée.");
  }

  async function removeClosure(id) {
    setMessage("");
    const { error } = await sb.from("reservation_exceptions").delete().eq("id", id);
    if (error) return setMessage(`Erreur : ${error.message}`);
    setExceptions((items) => items.filter((item) => item.id !== id));
    setMessage("Fermeture supprimée.");
  }

  if (user === undefined || (user && loading)) return <main><section><p>Chargement des réservations…</p></section></main>;
  if (!user) return <main><section><h2>Accès protégé</h2><p>Connectez-vous d’abord à Maison Oddos.</p><a href="/"><button>Retour à la connexion</button></a></section></main>;

  const pendingCount = reservations.filter((item) => item.status === "pending").length;
  const confirmedCount = reservations.filter((item) => item.status === "confirmed" && item.reservation_date >= today).length;
  const upcomingCovers = reservations.filter((item) => item.status === "confirmed" && item.reservation_date >= today).reduce((sum, item) => sum + Number(item.party_size || 0), 0);

  return (
    <main>
      <header>
        <div><div className="brand">MAISON ODDOS</div><h1>Réservations</h1></div>
        <div className="headerActions">
          <a href="/reservation" target="_blank"><button className="secondary">Page client ↗</button></a>
          <a href="/"><button>← Pilotage</button></a>
        </div>
      </header>
      <section>
        <div className="reservationViewTabs">
          <button className={view === "reservations" ? "active" : "secondary"} onClick={() => setView("reservations")}>Réservations</button>
          <button className={view === "settings" ? "active" : "secondary"} onClick={() => setView("settings")}>Horaires et fermetures</button>
        </div>
        {message && <p className="message">{message}</p>}

        {view === "reservations" ? <>
          <div className="grid">
            <article className="card"><span>À confirmer</span><strong>{pendingCount}</strong></article>
            <article className="card"><span>Confirmées à venir</span><strong>{confirmedCount}</strong></article>
            <article className="card"><span>Couverts confirmés à venir</span><strong>{upcomingCovers}</strong></article>
          </div>
          <div className="reservationFilters">
            {[["upcoming", "À venir"], ["pending", "À confirmer"], ["all", "Toutes"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : "secondary"} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
          {!visible.length ? <div className="formCard"><p>Aucune réservation dans cette vue.</p></div> : <div className="reservationList">
            {visible.map((reservation) => <article className="reservationCard" key={reservation.id}>
              <div className="reservationDate"><strong>{new Date(`${reservation.reservation_date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</strong><span>{timeValue(reservation.reservation_time)}</span></div>
              <div className="reservationIdentity"><span className={`status status-${reservation.status}`}>{statusLabels[reservation.status]}</span><h3>{reservation.customer_name} · {reservation.party_size} pers.</h3><p><b>{names[reservation.establishment_id] || "Restaurant"}</b></p><p>{reservation.phone}{reservation.email ? ` · ${reservation.email}` : ""}</p>{reservation.notes && <small>{reservation.notes}</small>}</div>
              <div className="reservationActions"><button onClick={() => changeStatus(reservation.id, "confirmed")}>Confirmer</button><button className="secondary" onClick={() => changeStatus(reservation.id, "cancelled")}>Annuler</button><select value={reservation.status} onChange={(event) => changeStatus(reservation.id, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            </article>)}
          </div>}
        </> : <div className="settingsLayout">
          <div className="settingsToolbar">
            <label>Restaurant<select value={selectedEstablishment} onChange={(event) => setSelectedEstablishment(event.target.value)}>{establishments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="toggleLine"><input type="checkbox" checked={Boolean(selectedSetting.online_enabled)} onChange={(event) => changeSetting("online_enabled", event.target.checked)} /><span>Réservations en ligne ouvertes</span></label>
            <label>Réservation possible jusqu’à<input type="number" min="1" max="365" value={selectedSetting.booking_days_ahead} onChange={(event) => changeSetting("booking_days_ahead", event.target.value)} /><small>jours à l’avance</small></label>
          </div>

          <div className="scheduleGrid">
            {dayLabels.map((day, weekday) => <article className="scheduleDay" key={day}>
              <h3>{day}</h3>
              {serviceLabels.map((label) => {
                const service = selectedServices.find((item) => Number(item.weekday) === weekday && item.label === label);
                if (!service) return null;
                return <div className={`serviceEditor ${service.active ? "open" : "closed"}`} key={service.id}>
                  <label className="toggleLine"><input type="checkbox" checked={Boolean(service.active)} onChange={(event) => changeService(service.id, "active", event.target.checked)} /><b>{label}</b><span>{service.active ? "Ouvert" : "Fermé"}</span></label>
                  <div className="serviceFields">
                    <label>De<input type="time" value={timeValue(service.start_time)} disabled={!service.active} onChange={(event) => changeService(service.id, "start_time", event.target.value)} /></label>
                    <label>À<input type="time" value={timeValue(service.end_time)} disabled={!service.active} onChange={(event) => changeService(service.id, "end_time", event.target.value)} /></label>
                    <label>Créneaux<select value={service.slot_interval} disabled={!service.active} onChange={(event) => changeService(service.id, "slot_interval", event.target.value)}>{[15, 30, 45, 60].map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
                    <label>Max. personnes<input type="number" min="1" max="50" value={service.max_party_size} disabled={!service.active} onChange={(event) => changeService(service.id, "max_party_size", event.target.value)} /></label>
                  </div>
                </div>;
              })}
            </article>)}
          </div>
          <button className="saveSchedule" disabled={saving} onClick={saveSchedule}>{saving ? "Enregistrement…" : `Enregistrer les horaires de ${names[selectedEstablishment] || "ce restaurant"}`}</button>

          <article className="closureCard">
            <div><span>Fermetures exceptionnelles</span><h2>Bloquer une date</h2><p>La date ne proposera aucun créneau sur la page client.</p></div>
            <form className="closureForm" onSubmit={addClosure}><label>Date<input required type="date" value={closure.exception_date} onChange={(event) => setClosure({ ...closure, exception_date: event.target.value })} /></label><label>Motif <small>facultatif</small><input placeholder="Congés, privatisation…" value={closure.note} onChange={(event) => setClosure({ ...closure, note: event.target.value })} /></label><button>Ajouter la fermeture</button></form>
            <div className="closureList">{!selectedExceptions.length ? <p>Aucune fermeture exceptionnelle enregistrée.</p> : selectedExceptions.map((item) => <div key={item.id}><b>{new Date(`${item.exception_date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b><span>{item.note || "Fermé"}</span><button className="secondary" onClick={() => removeClosure(item.id)}>Supprimer</button></div>)}</div>
          </article>
        </div>}
      </section>
    </main>
  );
}
