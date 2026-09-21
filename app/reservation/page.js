"use client";

import { useEffect, useMemo, useState } from "react";

const today = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};
const timeToMinutes = (value) => {
  const [hours, minutes] = String(value).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};
const timeLabel = (value) => String(value).slice(0, 5).replace(":", "h");
const nextAvailableDate = (services, exceptions, establishmentId, daysAhead = 180) => {
  const start = new Date(`${today()}T12:00:00`);
  const closedDates = new Set(
    exceptions
      .filter((item) => item.establishment_id === establishmentId)
      .map((item) => item.exception_date),
  );
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    const local = new Date(candidate);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    const date = local.toISOString().slice(0, 10);
    if (
      !closedDates.has(date) &&
      services.some(
        (service) =>
          service.establishment_id === establishmentId &&
          Number(service.weekday) === candidate.getDay(),
      )
    ) {
      return date;
    }
  }
  return today();
};

export default function ReservationPage() {
  const [data, setData] = useState({ establishments: [], services: [], settings: [], exceptions: [] });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({
    establishment_id: "",
    reservation_date: today(),
    reservation_time: "",
    party_size: "2",
    customer_name: "",
    phone: "",
    email: "",
    notes: "",
    website: "",
  });

  useEffect(() => {
    fetch("/api/reservations", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setData(body);
        const firstEstablishment = body.establishments?.[0]?.id || "";
        setForm((current) => ({
          ...current,
          establishment_id: current.establishment_id || firstEstablishment,
          reservation_date: nextAvailableDate(
            body.services || [],
            body.exceptions || [],
            current.establishment_id || firstEstablishment,
            body.settings?.find((item) => item.establishment_id === (current.establishment_id || firstEstablishment))?.booking_days_ahead || 180,
          ),
        }));
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  const services = useMemo(() => {
    if (!form.reservation_date) return [];
    if (data.exceptions.some(
      (item) => item.establishment_id === form.establishment_id && item.exception_date === form.reservation_date,
    )) return [];
    const weekday = new Date(`${form.reservation_date}T12:00:00`).getDay();
    return data.services.filter(
      (service) =>
        service.establishment_id === form.establishment_id &&
        Number(service.weekday) === weekday,
    );
  }, [data.services, data.exceptions, form.establishment_id, form.reservation_date]);

  const maxDate = useMemo(() => {
    const days = Number(data.settings.find(
      (item) => item.establishment_id === form.establishment_id,
    )?.booking_days_ahead || 180);
    const value = new Date(`${today()}T12:00:00`);
    value.setDate(value.getDate() + days);
    value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
    return value.toISOString().slice(0, 10);
  }, [data.settings, form.establishment_id]);

  function selectRestaurant(establishmentId) {
    const days = Number(data.settings.find(
      (item) => item.establishment_id === establishmentId,
    )?.booking_days_ahead || 180);
    setForm((current) => ({
      ...current,
      establishment_id: establishmentId,
      reservation_date: nextAvailableDate(
        data.services,
        data.exceptions,
        establishmentId,
        days,
      ),
      reservation_time: "",
    }));
  }

  const slots = useMemo(() => {
    const values = [];
    services.forEach((service) => {
      const start = timeToMinutes(service.start_time);
      const end = timeToMinutes(service.end_time);
      const interval = Number(service.slot_interval || 30);
      for (let value = start; value <= end; value += interval) {
        const hours = String(Math.floor(value / 60)).padStart(2, "0");
        const minutes = String(value % 60).padStart(2, "0");
        values.push({
          value: `${hours}:${minutes}`,
          label: `${service.label} · ${timeLabel(`${hours}:${minutes}`)}`,
          max: Number(service.max_party_size || 12),
        });
      }
    });
    return values;
  }, [services]);

  useEffect(() => {
    if (!slots.some((slot) => slot.value === form.reservation_time)) {
      setForm((current) => ({ ...current, reservation_time: slots[0]?.value || "" }));
    }
  }, [slots, form.reservation_time]);

  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSuccess(body);
    } catch (submitError) {
      setError(submitError.message || "Réservation impossible");
    } finally {
      setSending(false);
    }
  }

  if (success) {
    return (
      <main className="bookingPage">
        <section className="bookingSuccess">
          <div className="bookingMark">✓</div>
          <div className="brand">MAISON ODDOS</div>
          <h1>Demande bien reçue</h1>
          <p>
            Votre demande a été transmise à <b>{success.restaurant}</b>. Elle est
            en attente de confirmation par le restaurant.
          </p>
          <div className="bookingReference">
            Référence <strong>{success.confirmation_code}</strong>
          </div>
          <button onClick={() => window.location.reload()}>
            Faire une autre réservation
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="bookingPage">
      <header className="bookingHeader">
        <div>
          <div className="brand">MAISON ODDOS</div>
          <h1>Réserver une table</h1>
        </div>
        <div className="bookingHeaderNote">Villa Valleyre · La Maison du Parc</div>
      </header>
      <section className="bookingShell">
        <div className="bookingIntro">
          <span>Votre prochaine table</span>
          <h2>Choisissez votre restaurant et votre horaire.</h2>
          <p>
            Votre demande sera contrôlée par notre équipe. Vous recevrez ensuite
            la confirmation définitive du restaurant.
          </p>
        </div>
        <div className="bookingFormCard">
          {loading ? (
            <p>Chargement des créneaux…</p>
          ) : (
            <form onSubmit={submit} className="bookingForm">
              <label>
                Restaurant
                <select required value={form.establishment_id} onChange={(event) => selectRestaurant(event.target.value)}>
                  {data.establishments.map((establishment) => (
                    <option key={establishment.id} value={establishment.id}>{establishment.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input required type="date" min={today()} max={maxDate} value={form.reservation_date} onChange={(event) => setForm({ ...form, reservation_date: event.target.value })} />
              </label>
              <label>
                Horaire
                <select required disabled={!slots.length} value={form.reservation_time} onChange={(event) => setForm({ ...form, reservation_time: event.target.value })}>
                  {!slots.length && <option value="">Restaurant fermé</option>}
                  {slots.map((slot) => <option key={`${slot.label}-${slot.value}`} value={slot.value}>{slot.label}</option>)}
                </select>
              </label>
              <label>
                Nombre de personnes
                <input required type="number" min="1" max={slots.find((slot) => slot.value === form.reservation_time)?.max || 12} value={form.party_size} onChange={(event) => setForm({ ...form, party_size: event.target.value })} />
              </label>
              <label>
                Nom et prénom
                <input required autoComplete="name" value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} />
              </label>
              <label>
                Téléphone
                <input required type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </label>
              <label className="bookingWide">
                Adresse e-mail
                <input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label className="bookingWide">
                Demande particulière <small>Facultatif</small>
                <textarea rows="4" placeholder="Allergies, anniversaire, chaise bébé…" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>
              <input className="bookingTrap" tabIndex="-1" autoComplete="off" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
              {error && <p className="bookingError">{error}</p>}
              <button disabled={sending || !slots.length}>{sending ? "Envoi…" : "Envoyer ma demande"}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
