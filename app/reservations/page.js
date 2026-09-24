"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const parisToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const csvValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export default function ReservationsAdmin() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  const [reservations, setReservations] = useState([]);
  const [establishments, setEstablishments] = useState([]);
  const [services, setServices] = useState([]);
  const [settings, setSettings] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [view, setView] = useState("reservations");
  const [selectedEstablishment, setSelectedEstablishment] = useState("");
  const [reservationEstablishment, setReservationEstablishment] = useState("all");
  const [filter, setFilter] = useState("upcoming");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [closure, setClosure] = useState({ exception_date: "", service_scope: "all", note: "" });
  const [commercial, setCommercial] = useState({
    establishment_id: "", reservation_date: "", service_scope: "midi",
    reservation_time: "12:00", reservation_type: "standard", status: "confirmed",
    party_size: "2", customer_name: "", phone: "", email: "", notes: "",
  });
  const [editingNote, setEditingNote] = useState(null);
  const [teamUsers, setTeamUsers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamForm, setTeamForm] = useState({
    full_name: "",
    email: "",
    password: "",
    establishment_id: "",
  });
  const reservationIds = useRef(new Set());
  const alertsEnabledRef = useRef(false);
  const audioContextRef = useRef(null);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const currentUser = data?.user || null;
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        return;
      }
      const { data: currentProfile } = await sb
        .from("profiles")
        .select("user_id,full_name,role,establishment_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      setProfile(currentProfile || null);
    });
    const enabled = window.localStorage.getItem("reservation-alerts-enabled") === "true";
    alertsEnabledRef.current = enabled;
    setAlertsEnabled(enabled);
    if ("Notification" in window) setNotificationPermission(Notification.permission);
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
    reservationIds.current = new Set((results[0].data || []).map((item) => item.id));
    setEstablishments(results[1].data || []);
    setServices(results[2].data || []);
    setSettings(results[3].data || []);
    setExceptions(results[4].data || []);
    setSelectedEstablishment((current) => current || results[1].data?.[0]?.id || "");
    setCommercial((current) => ({
      ...current, establishment_id: current.establishment_id || results[1].data?.[0]?.id || "",
    }));
    setLoading(false);
  }

  useEffect(() => {
    if (user && profile) load();
  }, [user, profile]);

  const isManagement = ["direction", "administratif"].includes(profile?.role);
  const isReservationStaff = profile?.role === "reservation_staff";

  const names = useMemo(
    () => Object.fromEntries(establishments.map((item) => [item.id, item.name])),
    [establishments],
  );

  function playReservationSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = audioContextRef.current || new AudioContext();
      audioContextRef.current = context;
      context.resume();
      [0, 0.22, 0.44].forEach((delay, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + delay;
        oscillator.type = "sine";
        oscillator.frequency.value = [659, 784, 988][index];
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.28, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.2);
      });
    } catch (error) {
      console.warn("reservation sound", error);
    }
  }

  async function activateAlerts() {
    let permission = "unsupported";
    if ("Notification" in window) {
      permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
    window.localStorage.setItem("reservation-alerts-enabled", "true");
    alertsEnabledRef.current = true;
    setAlertsEnabled(true);
    playReservationSound();
    if (permission === "denied") {
      setMessage("Sonnerie activée. Les notifications du téléphone sont bloquées dans les réglages du navigateur.");
    } else {
      setMessage("Alertes activées. Vous entendrez cette sonnerie à la prochaine réservation.");
    }
  }

  useEffect(() => {
    if (!user || loading) return undefined;
    let stopped = false;

    const checkNewReservations = async () => {
      const { data, error } = await sb
        .from("reservations")
        .select("*")
        .order("reservation_date", { ascending: true })
        .order("reservation_time", { ascending: true });
      if (stopped || error || !data) return;
      const newReservations = data.filter((item) => !reservationIds.current.has(item.id));
      data.forEach((item) => reservationIds.current.add(item.id));
      setReservations(data);
      if (!newReservations.length || !alertsEnabledRef.current) return;

      playReservationSound();
      const latest = newReservations[newReservations.length - 1];
      const restaurantName = names[latest.establishment_id] || "Maison Oddos";
      const title = newReservations.length > 1
        ? `${newReservations.length} nouvelles réservations`
        : `Nouvelle réservation — ${restaurantName}`;
      const body = newReservations.length > 1
        ? "Ouvrez le tableau pour les valider."
        : `${latest.customer_name} · ${latest.party_size} pers. · ${latest.reservation_date} à ${timeValue(latest.reservation_time)}`;
      if ("Notification" in window && Notification.permission === "granted") {
        const notification = new Notification(title, { body, tag: `reservation-${latest.id}` });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
      setMessage(`${title}. À confirmer dans la liste ci-dessous.`);
    };

    const timer = window.setInterval(checkNewReservations, 15000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkNewReservations();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user, loading, names]);
  const today = parisToday();
  const restaurantReservations = reservations.filter((reservation) => (
    reservationEstablishment === "all" ||
    reservation.establishment_id === reservationEstablishment
  ));
  const visible = restaurantReservations.filter((reservation) => {
    if (reservation.reservation_date < today) return false;
    if (filter === "pending") return reservation.status === "pending";
    if (filter === "upcoming") return reservation.status !== "cancelled";
    return true;
  });
  const selectedSetting = settings.find((item) => item.establishment_id === selectedEstablishment) || {
    establishment_id: selectedEstablishment,
    online_enabled: true,
    booking_days_ahead: 180,
  };
  const selectedServices = services.filter((item) => item.establishment_id === selectedEstablishment);
  const selectedExceptions = exceptions.filter((item) => item.establishment_id === selectedEstablishment);

  async function createCommercialReservation(event) {
    event.preventDefault();
    if (!isManagement || saving) return;
    setMessage("");
    const sameService = reservations.filter((item) =>
      item.establishment_id === commercial.establishment_id &&
      item.reservation_date === commercial.reservation_date &&
      ["pending", "confirmed"].includes(item.status) &&
      (commercial.service_scope === "midi" ? timeValue(item.reservation_time) < "17:00" : timeValue(item.reservation_time) >= "17:00"),
    );
    const acceptExisting = commercial.reservation_type === "privatisation" && sameService.length > 0;
    if (acceptExisting && !window.confirm(
      `Ce service compte déjà ${sameService.length} réservation(s). Elles resteront actives. Avez-vous vérifié ces réservations avant de bloquer le service ?`,
    )) return;
    setSaving(true);
    const { data, error } = await sb.rpc("create_commercial_reservation", {
      p_establishment_id: commercial.establishment_id,
      p_reservation_date: commercial.reservation_date,
      p_service_scope: commercial.service_scope,
      p_reservation_time: commercial.reservation_time,
      p_party_size: Number(commercial.party_size),
      p_customer_name: commercial.customer_name.trim(),
      p_phone: commercial.phone.trim(),
      p_email: commercial.email.trim() || null,
      p_notes: commercial.notes.trim() || null,
      p_reservation_type: commercial.reservation_type,
      p_status: commercial.status,
      p_accept_existing: acceptExisting,
    });
    setSaving(false);
    if (error) return setMessage(`Erreur : ${error.message}`);
    reservationIds.current.add(data.id);
    setReservations((items) => [...items, data].sort((a, b) =>
      `${a.reservation_date} ${a.reservation_time}`.localeCompare(`${b.reservation_date} ${b.reservation_time}`),
    ));
    if (commercial.reservation_type === "privatisation") {
      const { data: updatedExceptions } = await sb.from("reservation_exceptions").select("*").order("exception_date");
      if (updatedExceptions) setExceptions(updatedExceptions);
    }
    setReservationEstablishment(commercial.establishment_id);
    setCommercial((current) => ({
      ...current, customer_name: "", phone: "", email: "", notes: "", party_size: "2",
    }));
    setView("reservations");
    setFilter("upcoming");
    setMessage(commercial.reservation_type === "privatisation"
      ? "Privatisation enregistrée et service bloqué aux réservations en ligne."
      : "Réservation commerciale enregistrée.");
  }

  async function saveAnnotation(event) {
    event.preventDefault();
    if (!isManagement || !editingNote) return;
    setSaving(true);
    const { data, error } = await sb.from("reservations")
      .update({ notes: editingNote.notes.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", editingNote.id).select().single();
    setSaving(false);
    if (error) return setMessage(`Erreur : ${error.message}`);
    setReservations((items) => items.map((item) => item.id === data.id ? data : item));
    setEditingNote(null);
    setMessage("Annotation enregistrée.");
  }

  async function authenticatedTeamRequest(options = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error("Votre session a expiré. Reconnectez-vous.");
    const response = await fetch("/api/team-users", {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Opération impossible.");
    return body;
  }

  async function loadTeamUsers() {
    if (!isManagement) return;
    setTeamLoading(true);
    try {
      const body = await authenticatedTeamRequest();
      setTeamUsers(body.users || []);
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setTeamLoading(false);
    }
  }

  async function createTeamUser(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const body = await authenticatedTeamRequest({
        method: "POST",
        body: JSON.stringify(teamForm),
      });
      setTeamUsers((items) => [...items, body.user]);
      setTeamForm({
        full_name: "",
        email: "",
        password: "",
        establishment_id: establishments[0]?.id || "",
      });
      setMessage("Accès équipe créé. Vous pouvez transmettre l’adresse /equipe et le mot de passe au salarié.");
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeamUser(teamUser) {
    if (!window.confirm(`Supprimer l’accès de ${teamUser.full_name || teamUser.email} ?`)) return;
    setMessage("");
    try {
      await authenticatedTeamRequest({
        method: "DELETE",
        body: JSON.stringify({ user_id: teamUser.user_id }),
      });
      setTeamUsers((items) => items.filter((item) => item.user_id !== teamUser.user_id));
      setMessage("Accès équipe supprimé.");
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    }
  }

  useEffect(() => {
    if (view === "team" && isManagement) loadTeamUsers();
  }, [view, isManagement]);

  useEffect(() => {
    if (!teamForm.establishment_id && establishments[0]?.id) {
      setTeamForm((current) => ({ ...current, establishment_id: establishments[0].id }));
    }
  }, [establishments, teamForm.establishment_id]);

  async function logout() {
    await sb.auth.signOut();
    window.location.replace("/equipe");
  }

  async function changeStatus(id, status) {
    setMessage("");
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) return setMessage("Votre session a expiré. Reconnectez-vous.");
    try {
      const response = await fetch("/api/reservations", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setReservations((items) => items.map((item) => (item.id === id ? body.reservation : item)));
      if (status === "cancelled" && body.reservation.reservation_type === "privatisation") {
        setExceptions((items) => items.filter((item) => item.reservation_id !== id));
      }
      if (status !== "confirmed") {
        setMessage(body.reservation.reservation_type === "privatisation" && status === "cancelled"
          ? "Privatisation annulée : le service est de nouveau disponible."
          : "Réservation mise à jour.");
      } else if (body.reservation.reservation_type === "privatisation") {
        setMessage("Privatisation confirmée.");
      } else if (body.email_sent) {
        setMessage("Réservation confirmée et courriel envoyé au client.");
      } else if (body.email_reason === "no_email") {
        setMessage("Réservation confirmée, mais le client n’a pas renseigné d’adresse e-mail.");
      } else {
        setMessage(`Réservation confirmée, mais le courriel n’a pas pu être envoyé${body.email_details ? ` : ${body.email_details}` : "."} Vous pouvez cliquer à nouveau sur Confirmer.`);
      }
    } catch (error) {
      setMessage(`Erreur : ${error.message || "mise à jour impossible"}`);
    }
  }

  async function deleteReservation(reservation) {
    const label = `${reservation.customer_name}, le ${new Date(`${reservation.reservation_date}T12:00:00`).toLocaleDateString("fr-FR")}`;
    if (!window.confirm(`Supprimer définitivement la réservation de ${label} ?${reservation.reservation_type === "privatisation" ? " Le service sera de nouveau disponible." : ""}`)) return;
    setMessage("");
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) return setMessage("Votre session a expiré. Reconnectez-vous.");
    try {
      const response = await fetch("/api/reservations", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: reservation.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setReservations((items) => items.filter((item) => item.id !== reservation.id));
      if (reservation.reservation_type === "privatisation") {
        setExceptions((items) => items.filter((item) => item.reservation_id !== reservation.id));
      }
      setMessage("Réservation supprimée.");
    } catch (error) {
      setMessage(`Erreur : ${error.message || "suppression impossible"}`);
    }
  }

  function exportCustomerEmails() {
    const selectedRows = reservations.filter((reservation) => (
      reservation.email &&
      (reservationEstablishment === "all" || reservation.establishment_id === reservationEstablishment)
    ));
    const customersByEmail = new Map();
    selectedRows.forEach((reservation) => {
      const email = String(reservation.email).trim().toLowerCase();
      const current = customersByEmail.get(email);
      if (!current || reservation.reservation_date > current.reservation_date) {
        customersByEmail.set(email, reservation);
      }
    });
    const customers = [...customersByEmail.values()].sort((a, b) => (
      String(a.customer_name).localeCompare(String(b.customer_name), "fr")
    ));
    if (!customers.length) return setMessage("Aucune adresse e-mail à exporter pour cette sélection.");
    const lines = [
      ["Nom", "E-mail", "Téléphone", "Restaurant", "Dernière réservation"],
      ...customers.map((reservation) => [
        reservation.customer_name,
        reservation.email,
        reservation.phone,
        names[reservation.establishment_id] || "Restaurant",
        reservation.reservation_date,
      ]),
    ];
    const csv = `\uFEFF${lines.map((line) => line.map(csvValue).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `clients-reservations-${reservationEstablishment === "all" ? "maison-oddos" : (names[reservationEstablishment] || "restaurant").toLowerCase().replaceAll(" ", "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage(`${customers.length} adresse${customers.length > 1 ? "s" : ""} e-mail exportée${customers.length > 1 ? "s" : ""}.`);
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
    const existing = exceptions.filter((item) =>
      item.establishment_id === selectedEstablishment && item.exception_date === closure.exception_date && item.is_closed,
    );
    if (existing.some((item) => item.reservation_id && (item.service_scope === closure.service_scope || closure.service_scope === "all"))) {
      return setMessage("Ce service est lié à une privatisation. Gérez-la dans Réservations.");
    }
    if (existing.some((item) => item.service_scope === "all" && closure.service_scope !== "all")) {
      return setMessage("La journée entière est déjà bloquée.");
    }
    const { data, error } = await sb.from("reservation_exceptions").upsert({
      establishment_id: selectedEstablishment,
      exception_date: closure.exception_date,
      service_scope: closure.service_scope,
      is_closed: true,
      note: closure.note.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "establishment_id,exception_date,service_scope" }).select().single();
    if (error) return setMessage(`Erreur : ${error.message}`);
    setExceptions((items) => [...items.filter((item) => item.id !== data.id), data].sort((a, b) => a.exception_date.localeCompare(b.exception_date)));
    setClosure({ exception_date: "", service_scope: "all", note: "" });
    setMessage("Fermeture exceptionnelle ajoutée.");
  }

  async function removeClosure(id) {
    setMessage("");
    const { error } = await sb.from("reservation_exceptions").delete().eq("id", id);
    if (error) return setMessage(`Erreur : ${error.message}`);
    setExceptions((items) => items.filter((item) => item.id !== id));
    setMessage("Fermeture supprimée.");
  }

  if (user === undefined || profile === undefined || (user && profile && loading)) return <main><section><p>Chargement des réservations…</p></section></main>;
  if (!user) return <main><section><h2>Accès protégé</h2><p>Connectez-vous à l’espace équipe Maison Oddos.</p><a href="/equipe"><button>Se connecter</button></a></section></main>;
  if (!isManagement && !isReservationStaff) return <main><section><h2>Accès refusé</h2><p>Ce compte n’est pas autorisé à gérer les réservations.</p><button onClick={logout}>Déconnexion</button></section></main>;

  const pendingCount = restaurantReservations.filter((item) => item.status === "pending" && item.reservation_date >= today).length;
  const confirmedCount = restaurantReservations.filter((item) => item.status === "confirmed" && item.reservation_date >= today).length;
  const upcomingCovers = restaurantReservations.filter((item) => item.status === "confirmed" && item.reservation_date >= today).reduce((sum, item) => sum + Number(item.party_size || 0), 0);

  return (
    <main>
      <header>
        <div><div className="brand">MAISON ODDOS</div><h1>Réservations</h1></div>
        <div className="headerActions">
          <button className={alertsEnabled ? "alertButton alertButtonActive" : "alertButton"} onClick={activateAlerts}>
            {alertsEnabled ? "🔔 Alertes activées" : "🔔 Activer les alertes"}
          </button>
          <a href="/reservation" target="_blank"><button className="secondary">Page client ↗</button></a>
          {isManagement && view !== "team" && <a href="/"><button className="pilotageReturn">← Retour au pilotage</button></a>}
          <button className="secondary" onClick={logout}>Déconnexion</button>
        </div>
      </header>
      <section>
        <div className="reservationViewTabs">
          <button className={view === "reservations" ? "active" : "secondary"} onClick={() => setView("reservations")}>Réservations</button>
          {isManagement && <button className={view === "commercial" ? "active" : "secondary"} onClick={() => setView("commercial")}>Saisie commerciale</button>}
          {isManagement && <button className={view === "settings" ? "active" : "secondary"} onClick={() => setView("settings")}>Horaires et fermetures</button>}
          {isManagement && <button className={view === "team" ? "active" : "secondary"} onClick={() => setView("team")}>Accès équipe</button>}
        </div>
        {message && <p className="message">{message}</p>}
        {alertsEnabled && notificationPermission === "granted" && <p className="reservationAlertStatus">Sonnerie et notifications du téléphone actives. Gardez cette page ouverte en arrière-plan.</p>}
        {alertsEnabled && notificationPermission !== "granted" && <p className="reservationAlertStatus">Sonnerie active lorsque cette page reste ouverte.</p>}

        {view === "reservations" ? <>
          <div className="grid">
            <article className="card"><span>À confirmer</span><strong>{pendingCount}</strong></article>
            <article className="card"><span>Confirmées à venir</span><strong>{confirmedCount}</strong></article>
            <article className="card"><span>Couverts confirmés à venir</span><strong>{upcomingCovers}</strong></article>
          </div>
          <div className="reservationToolbar">
            {isManagement ? <label>Restaurant
              <select value={reservationEstablishment} onChange={(event) => setReservationEstablishment(event.target.value)}>
                <option value="all">Tous les restaurants</option>
                {establishments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label> : <div className="formCard"><b>{names[profile.establishment_id] || establishments[0]?.name || "Votre restaurant"}</b></div>}
            {isManagement && <button className="secondary" onClick={exportCustomerEmails}>Exporter les e-mails clients</button>}
          </div>
          <div className="reservationFilters">
            {[["upcoming", "À venir"], ["pending", "À confirmer"], ["all", "Toutes à venir"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : "secondary"} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
          {!visible.length ? <div className="formCard"><p>Aucune réservation dans cette vue.</p></div> : <div className="reservationList">
            {visible.map((reservation) => <article className="reservationCard" key={reservation.id}>
              <div className="reservationDate"><strong>{new Date(`${reservation.reservation_date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</strong><span>{timeValue(reservation.reservation_time)}</span></div>
              <div className="reservationIdentity"><span className={`status status-${reservation.status}`}>{statusLabels[reservation.status]}</span>{reservation.reservation_type === "privatisation" && <span className="privateBadge">Privatisation · {timeValue(reservation.reservation_time) < "17:00" ? "midi" : "soir"}</span>}<h3>{reservation.customer_name} · {reservation.party_size} pers.</h3><p><b>{names[reservation.establishment_id] || "Restaurant"}</b></p><p>{reservation.phone}{reservation.email ? ` · ${reservation.email}` : ""}</p>{reservation.notes && <p className="reservationNote">{reservation.notes}</p>}{isManagement && (editingNote?.id === reservation.id ? <form className="annotationForm" onSubmit={saveAnnotation}><label>Annotation<textarea maxLength="2000" rows="3" value={editingNote.notes} onChange={(event) => setEditingNote({ ...editingNote, notes: event.target.value })} /></label><div><button disabled={saving}>Enregistrer</button><button type="button" className="secondary" onClick={() => setEditingNote(null)}>Annuler</button></div></form> : <button className="annotationButton" onClick={() => setEditingNote({ id: reservation.id, notes: reservation.notes || "" })}>{reservation.notes ? "Modifier l’annotation" : "Ajouter une annotation"}</button>)}</div>
              <div className="reservationActions">{(isManagement || reservation.reservation_type !== "privatisation") && <><button disabled={reservation.reservation_type === "privatisation" && reservation.status === "cancelled"} onClick={() => changeStatus(reservation.id, "confirmed")}>Confirmer</button><button className="secondary" disabled={reservation.status === "cancelled"} onClick={() => changeStatus(reservation.id, "cancelled")}>Annuler</button><select value={reservation.status} disabled={reservation.reservation_type === "privatisation" && reservation.status === "cancelled"} onChange={(event) => changeStatus(reservation.id, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></>}{isManagement && <button className="dangerButton" onClick={() => deleteReservation(reservation)}>Supprimer</button>}</div>
            </article>)}
          </div>}
        </> : view === "commercial" && isManagement ? <article className="closureCard commercialCard">
          <div><span>Service commercial</span><h2>Ajouter une réservation</h2><p>Une privatisation bloque le service choisi sur la page de réservation client et apparaît dans la liste ci-dessus.</p></div>
          <form className="commercialForm" onSubmit={createCommercialReservation}>
            <label>Restaurant<select required value={commercial.establishment_id} onChange={(event) => setCommercial({ ...commercial, establishment_id: event.target.value })}>{establishments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Type<select value={commercial.reservation_type} onChange={(event) => setCommercial({ ...commercial, reservation_type: event.target.value })}><option value="standard">Réservation</option><option value="privatisation">Privatisation du service</option></select></label>
            <label>Date<input required min={today} type="date" value={commercial.reservation_date} onChange={(event) => setCommercial({ ...commercial, reservation_date: event.target.value })} /></label>
            <label>Service<select value={commercial.service_scope} onChange={(event) => setCommercial({ ...commercial, service_scope: event.target.value, reservation_time: event.target.value === "midi" ? "12:00" : "19:00" })}><option value="midi">Midi</option><option value="soir">Soir</option></select></label>
            <label>Heure<input required type="time" value={commercial.reservation_time} onChange={(event) => setCommercial({ ...commercial, reservation_time: event.target.value })} /></label>
            <label>Nombre de personnes<input required type="number" min="1" max="300" value={commercial.party_size} onChange={(event) => setCommercial({ ...commercial, party_size: event.target.value })} /></label>
            <label>Statut<select value={commercial.status} onChange={(event) => setCommercial({ ...commercial, status: event.target.value })}><option value="confirmed">Confirmée</option><option value="pending">Option à confirmer</option></select></label>
            <label>Nom du client ou de l’entreprise<input required minLength="2" maxLength="120" value={commercial.customer_name} onChange={(event) => setCommercial({ ...commercial, customer_name: event.target.value })} /></label>
            <label>Téléphone<input required type="tel" minLength="8" maxLength="30" value={commercial.phone} onChange={(event) => setCommercial({ ...commercial, phone: event.target.value })} /></label>
            <label>E-mail <small>facultatif</small><input type="email" maxLength="160" value={commercial.email} onChange={(event) => setCommercial({ ...commercial, email: event.target.value })} /></label>
            <label className="commercialWide">Annotation<textarea rows="4" maxLength="2000" placeholder="Événement, besoins particuliers, devis, suivi commercial…" value={commercial.notes} onChange={(event) => setCommercial({ ...commercial, notes: event.target.value })} /></label>
            {commercial.reservation_type === "privatisation" && <p className="commercialWide commercialHint">Une option à confirmer bloque aussi le service. L’annulation de cette privatisation libère le service. Les réservations déjà présentes restent visibles et doivent être traitées séparément.</p>}
            <button disabled={saving || !commercial.establishment_id}>{saving ? "Enregistrement…" : commercial.reservation_type === "privatisation" ? "Enregistrer et bloquer le service" : "Enregistrer la réservation"}</button>
          </form>
        </article> : view === "settings" ? <div className="settingsLayout">
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
            <div><span>Fermetures exceptionnelles</span><h2>Bloquer une date</h2><p>Choisissez la journée entière, le service du midi ou celui du soir.</p></div>
            <form className="closureForm" onSubmit={addClosure}><label>Date<input required type="date" value={closure.exception_date} onChange={(event) => setClosure({ ...closure, exception_date: event.target.value })} /></label><label>Service<select value={closure.service_scope} onChange={(event) => setClosure({ ...closure, service_scope: event.target.value })}><option value="all">Journée entière</option><option value="midi">Midi</option><option value="soir">Soir</option></select></label><label>Motif <small>facultatif</small><input placeholder="Congés, privatisation…" value={closure.note} onChange={(event) => setClosure({ ...closure, note: event.target.value })} /></label><button>Ajouter la fermeture</button></form>
            <div className="closureList">{!selectedExceptions.length ? <p>Aucune fermeture exceptionnelle enregistrée.</p> : selectedExceptions.map((item) => <div key={item.id}><b>{new Date(`${item.exception_date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b><span>{({ all: "Journée entière", midi: "Midi", soir: "Soir" })[item.service_scope || "all"]} · {item.note || "Fermé"}</span>{item.reservation_id ? <span>Gérée depuis Réservations</span> : <button className="secondary" onClick={() => removeClosure(item.id)}>Supprimer</button>}</div>)}</div>
          </article>
        </div> : <div className="settingsLayout">
          <article className="closureCard">
            <div>
              <span>Comptes salariés</span>
              <h2>Accès réservations uniquement</h2>
              <p>Chaque compte est limité au restaurant choisi et ne peut pas ouvrir le pilotage.</p>
            </div>
            <form className="closureForm" onSubmit={createTeamUser}>
              <label>Nom du salarié<input required minLength="2" value={teamForm.full_name} onChange={(event) => setTeamForm({ ...teamForm, full_name: event.target.value })} /></label>
              <label>Adresse e-mail<input required type="email" value={teamForm.email} onChange={(event) => setTeamForm({ ...teamForm, email: event.target.value })} /></label>
              <label>Mot de passe provisoire<input required type="password" minLength="10" value={teamForm.password} onChange={(event) => setTeamForm({ ...teamForm, password: event.target.value })} /><small>10 caractères minimum</small></label>
              <label>Restaurant<select required value={teamForm.establishment_id} onChange={(event) => setTeamForm({ ...teamForm, establishment_id: event.target.value })}>{establishments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <button disabled={saving}>{saving ? "Création…" : "Créer l’accès équipe"}</button>
            </form>
            <p><b>Adresse à transmettre :</b> {typeof window !== "undefined" ? `${window.location.origin}/equipe` : "/equipe"}</p>
          </article>
          <article className="closureCard">
            <div><span>Accès actifs</span><h2>Équipe réservations</h2></div>
            {teamLoading ? <p>Chargement…</p> : <div className="closureList">
              {!teamUsers.length ? <p>Aucun accès équipe créé.</p> : teamUsers.map((teamUser) => <div key={teamUser.user_id}>
                <b>{teamUser.full_name || teamUser.email}</b>
                <span>{teamUser.email} · {names[teamUser.establishment_id] || "Restaurant"}</span>
                <button className="dangerButton" onClick={() => deleteTeamUser(teamUser)}>Supprimer l’accès</button>
              </div>)}
            </div>}
          </article>
        </div>}
      </section>
    </main>
  );
}
