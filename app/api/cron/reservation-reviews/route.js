import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewLinks = {
  "la maison du parc": "https://g.page/r/CXXwus0n5LOWEBM/review",
  "villa valleyre": "https://g.page/r/CYbOL80GA5JOEBM/review",
};

function parisDate(offsetDays = 0) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function database(path, options = {}) {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error("Configuration Supabase manquante");
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function sendReviewEmail(reservation, name, link) {
  const date = new Date(`${reservation.reservation_date}T12:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric",
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `reservation-review-${reservation.id}`,
    },
    body: JSON.stringify({
      from: process.env.RESERVATION_FROM || "Réservations Maison Oddos <factures@reception.oddos.eu>",
      to: [reservation.email],
      subject: `Merci de votre visite — ${name}`,
      text: `Bonjour ${reservation.customer_name},\n\nMerci pour votre visite à ${name} le ${date}. Nous espérons que vous avez passé un agréable moment avec nous.\n\nSi vous souhaitez partager votre expérience, vous pouvez laisser un avis sincère sur Google :\n${link}\n\nVotre retour nous aide à progresser et à faire découvrir notre restaurant.\n\nAu plaisir de vous recevoir à nouveau,\nL’équipe de ${name}`,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Envoi des e-mails non configuré." }, { status: 503 });
  }

  try {
    const date = parisDate(-1);
    const [reservations, establishments] = await Promise.all([
      database(`reservations?reservation_date=eq.${date}&status=in.(confirmed,completed)&email=not.is.null&review_email_sent_at=is.null&select=id,establishment_id,reservation_date,customer_name,email`),
      database("establishments?select=id,name"),
    ]);
    const names = new Map(establishments.map((item) => [item.id, item.name]));
    let sent = 0;
    let failed = 0;
    for (const reservation of reservations) {
      const name = names.get(reservation.establishment_id);
      const link = reviewLinks[name?.trim().toLowerCase()];
      if (!link) continue;

      // The conditional PATCH claims the reservation for this invocation.
      // An expired claim is retried; Resend's stable key deduplicates retries.
      const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const claim = new Date().toISOString();
      const claimed = await database(
        `reservations?id=eq.${reservation.id}&reservation_date=eq.${date}&status=in.(confirmed,completed)&review_email_sent_at=is.null&or=(review_email_claimed_at.is.null,review_email_claimed_at.lt.${stale})&select=id`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ review_email_claimed_at: claim }) },
      );
      if (!claimed?.length) continue;
      try {
        await sendReviewEmail(reservation, name, link);
        await database(`reservations?id=eq.${reservation.id}&review_email_claimed_at=eq.${encodeURIComponent(claim)}`, {
          method: "PATCH",
          body: JSON.stringify({ review_email_sent_at: new Date().toISOString() }),
        });
        sent++;
      } catch (error) {
        failed++;
        console.error("review email", reservation.id, error);
        await database(`reservations?id=eq.${reservation.id}&review_email_claimed_at=eq.${encodeURIComponent(claim)}&review_email_sent_at=is.null`, {
          method: "PATCH",
          body: JSON.stringify({ review_email_claimed_at: null }),
        });
      }
    }
    return NextResponse.json({ date, sent, failed });
  } catch (error) {
    console.error("reservation reviews cron", error);
    return NextResponse.json({ error: "Envoi des avis indisponible." }, { status: 500 });
  }
}
