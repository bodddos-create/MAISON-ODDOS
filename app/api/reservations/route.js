import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publishableKey =
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE";
const allowedStatuses = new Set([
  "pending",
  "confirmed",
  "cancelled",
  "no_show",
  "completed",
]);

function configuration() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) throw new Error("Configuration serveur incomplète");
  return { supabaseUrl, secretKey, resendKey: process.env.RESEND_API_KEY };
}

async function supabaseRequest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return body;
}

async function userSupabaseRequest(config, token, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return body;
}

function parisToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function minutes(value) {
  const [hours, mins] = String(value).slice(0, 5).split(":").map(Number);
  return hours * 60 + mins;
}

async function sendAcknowledgement(config, reservation, restaurantName) {
  if (!config.resendKey || !reservation.email) return;
  const formattedDate = new Date(
    `${reservation.reservation_date}T12:00:00Z`,
  ).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.RESERVATION_FROM ||
        "Réservations Maison Oddos <factures@reception.oddos.eu>",
      to: [reservation.email],
      subject: `Demande de réservation reçue — ${restaurantName}`,
      text: `Bonjour ${reservation.customer_name},\n\nNous avons bien reçu votre demande pour ${restaurantName}, le ${formattedDate} à ${String(reservation.reservation_time).slice(0, 5)}, pour ${reservation.party_size} personne${reservation.party_size > 1 ? "s" : ""}.\n\nRéférence : ${reservation.confirmation_code}\n\nVotre réservation est en attente de confirmation par le restaurant.\n\nÀ très bientôt,\nMaison Oddos`,
    }),
    cache: "no-store",
  });
  if (!response.ok) console.error("reservation email", response.status, await response.text());
}

async function sendConfirmation(config, reservation, restaurantName) {
  if (!config.resendKey || !reservation.email) {
    return { sent: false, reason: reservation.email ? "configuration" : "no_email" };
  }
  const formattedDate = new Date(
    `${reservation.reservation_date}T12:00:00Z`,
  ).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `reservation-confirmed-${reservation.id}`,
    },
    body: JSON.stringify({
      from:
        process.env.RESERVATION_FROM ||
        "Réservations Maison Oddos <factures@reception.oddos.eu>",
      to: [reservation.email],
      subject: `Réservation confirmée — ${restaurantName}`,
      text: `Bonjour ${reservation.customer_name},

Votre réservation est confirmée.

Restaurant : ${restaurantName}
Date : ${formattedDate}
Heure : ${String(reservation.reservation_time).slice(0, 5)}
Nombre de personnes : ${reservation.party_size}
Référence : ${reservation.confirmation_code}

Nous avons hâte de vous accueillir.

À très bientôt,
Maison Oddos`,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const responseText = await response.text();
    console.error("reservation confirmation email", response.status, responseText);
    let details = `Resend ${response.status}`;
    try {
      const providerError = JSON.parse(responseText);
      details = String(
        providerError?.message ||
        providerError?.error?.message ||
        details,
      ).slice(0, 240);
    } catch {}
    return { sent: false, reason: "send_error", details };
  }
  return { sent: true };
}

export async function GET() {
  try {
    const config = configuration();
    const today = parisToday();
    const [allEstablishments, services, settings, exceptions] = await Promise.all([
      supabaseRequest(config, "establishments?active=eq.true&select=id,name&order=name.asc"),
      supabaseRequest(
        config,
        "reservation_services?active=eq.true&select=id,establishment_id,weekday,label,start_time,end_time,slot_interval,max_party_size&order=weekday.asc,start_time.asc",
      ),
      supabaseRequest(
        config,
        "reservation_settings?select=establishment_id,online_enabled,booking_days_ahead",
      ),
      supabaseRequest(
        config,
        `reservation_exceptions?exception_date=gte.${today}&is_closed=eq.true&select=establishment_id,exception_date,service_scope,note&order=exception_date.asc`,
      ),
    ]);
    const enabledIds = new Set(
      (settings || [])
        .filter((item) => item.online_enabled)
        .map((item) => item.establishment_id),
    );
    const establishments = (allEstablishments || []).filter((item) =>
      enabledIds.has(item.id),
    );
    return NextResponse.json({ establishments, services, settings, exceptions });
  } catch (error) {
    console.error("reservation GET", error);
    return NextResponse.json(
      { error: "Les créneaux sont momentanément indisponibles." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const config = configuration();
    const body = await request.json();
    if (String(body.website || "").trim()) return NextResponse.json({ ok: true });

    const establishmentId = String(body.establishment_id || "");
    const reservationDate = String(body.reservation_date || "");
    const reservationTime = String(body.reservation_time || "").slice(0, 5);
    const partySize = Math.round(Number(body.party_size));
    const customerName = String(body.customer_name || "").trim().slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 30);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 160);
    const notes = String(body.notes || "").trim().slice(0, 800);

    if (
      !establishmentId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(reservationDate) ||
      !/^\d{2}:\d{2}$/.test(reservationTime) ||
      !Number.isInteger(partySize) ||
      partySize < 1 ||
      partySize > 50 ||
      customerName.length < 2 ||
      phone.length < 8 ||
      (email && !emailPattern.test(email))
    ) {
      return NextResponse.json(
        { error: "Vérifiez les informations de la réservation." },
        { status: 400 },
      );
    }

    const today = parisToday();
    const weekday = new Date(`${reservationDate}T12:00:00Z`).getUTCDay();
    const [establishments, services, settings, exceptions] = await Promise.all([
      supabaseRequest(
        config,
        `establishments?id=eq.${encodeURIComponent(establishmentId)}&active=eq.true&select=id,name&limit=1`,
      ),
      supabaseRequest(
        config,
        `reservation_services?establishment_id=eq.${encodeURIComponent(establishmentId)}&weekday=eq.${weekday}&active=eq.true&select=*`,
      ),
      supabaseRequest(
        config,
        `reservation_settings?establishment_id=eq.${encodeURIComponent(establishmentId)}&select=online_enabled,booking_days_ahead&limit=1`,
      ),
      supabaseRequest(
        config,
        `reservation_exceptions?establishment_id=eq.${encodeURIComponent(establishmentId)}&exception_date=eq.${reservationDate}&is_closed=eq.true&select=service_scope`,
      ),
    ]);
    const establishment = establishments?.[0];
    if (!establishment) {
      return NextResponse.json({ error: "Restaurant introuvable." }, { status: 404 });
    }
    const setting = settings?.[0];
    if (!setting?.online_enabled || exceptions?.some((item) => !item.service_scope || item.service_scope === "all")) {
      return NextResponse.json(
        { error: "Le restaurant est fermé aux réservations pour cette date." },
        { status: 400 },
      );
    }
    const maxDate = new Date(`${today}T12:00:00Z`);
    maxDate.setUTCDate(maxDate.getUTCDate() + Number(setting.booking_days_ahead || 180));
    if (reservationDate < today || reservationDate > maxDate.toISOString().slice(0, 10)) {
      return NextResponse.json(
        { error: "Cette date n’est pas disponible à la réservation." },
        { status: 400 },
      );
    }

    const selectedMinutes = minutes(reservationTime);
    const service = (services || []).find((item) => {
      const start = minutes(item.start_time);
      const end = minutes(item.end_time);
      return (
        selectedMinutes >= start &&
        selectedMinutes <= end &&
        (selectedMinutes - start) % Number(item.slot_interval || 30) === 0
      );
    });
    if (!service || partySize > Number(service.max_party_size || 12)) {
      return NextResponse.json(
        { error: "Ce créneau n’est pas disponible pour ce nombre de personnes." },
        { status: 400 },
      );
    }
    if (exceptions?.some((item) =>
      (item.service_scope === "midi" && service.label === "Déjeuner") ||
      (item.service_scope === "soir" && service.label === "Dîner"),
    )) {
      return NextResponse.json(
        { error: "Ce service est fermé aux réservations pour cette date." },
        { status: 400 },
      );
    }

    const confirmationCode = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    const rows = await supabaseRequest(config, "reservations", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        establishment_id: establishmentId,
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        party_size: partySize,
        customer_name: customerName,
        phone,
        email: email || null,
        notes: notes || null,
        status: "pending",
        source: "online",
        confirmation_code: confirmationCode,
      }),
    });
    const reservation = rows?.[0];
    await sendAcknowledgement(config, reservation, establishment.name);
    return NextResponse.json({
      ok: true,
      confirmation_code: confirmationCode,
      restaurant: establishment.name,
    });
  } catch (error) {
    console.error("reservation POST", error);
    return NextResponse.json(
      { error: "Impossible d’enregistrer la demande pour le moment." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const config = configuration();
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";
    if (!token) {
      return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
    }

    const body = await request.json();
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Mise à jour invalide." }, { status: 400 });
    }

    const currentRows = await userSupabaseRequest(
      config,
      token,
      `reservations?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    );
    if (!currentRows?.[0]) {
      return NextResponse.json({ error: "Réservation introuvable." }, { status: 404 });
    }

    const updatedRows = await userSupabaseRequest(
      config,
      token,
      `reservations?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    const reservation = updatedRows?.[0];
    if (!reservation) {
      return NextResponse.json({ error: "Mise à jour refusée." }, { status: 403 });
    }

    let email = { sent: false, reason: "not_required" };
    if (status === "confirmed") {
      const establishments = await supabaseRequest(
        config,
        `establishments?id=eq.${encodeURIComponent(reservation.establishment_id)}&select=name&limit=1`,
      );
      email = await sendConfirmation(
        config,
        reservation,
        establishments?.[0]?.name || "Maison Oddos",
      );
    }

    return NextResponse.json({
      ok: true,
      reservation,
      email_sent: email.sent,
      email_reason: email.reason || null,
      email_details: email.details || null,
    });
  } catch (error) {
    console.error("reservation PATCH", error);
    return NextResponse.json(
      { error: "Impossible de mettre à jour cette réservation." },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const config = configuration();
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";
    if (!token) {
      return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
    }

    const body = await request.json();
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Suppression invalide." }, { status: 400 });
    }

    const currentRows = await userSupabaseRequest(
      config,
      token,
      `reservations?id=eq.${encodeURIComponent(id)}&select=id&limit=1`,
    );
    if (!currentRows?.[0]) {
      return NextResponse.json({ error: "Réservation introuvable." }, { status: 404 });
    }

    const deletedRows = await userSupabaseRequest(
      config,
      token,
      `reservations?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      },
    );
    if (!deletedRows?.[0]) {
      return NextResponse.json({ error: "Suppression refusée." }, { status: 403 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("reservation DELETE", error);
    return NextResponse.json(
      { error: "Impossible de supprimer cette réservation." },
      { status: 500 },
    );
  }
}
