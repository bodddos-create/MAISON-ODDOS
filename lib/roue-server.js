import crypto from "node:crypto";
import { campaign, establishmentId, publicCoupon } from "./roue-config.js";
export function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw Error("Configuration indisponible");
  return { url, key, resend: process.env.RESEND_API_KEY };
}
export function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}
export async function requestDb(c, path, options = {}) {
  const r = await fetch(`${c.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  const raw = await r.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!r.ok) {
    const e = Error("Database request failed");
    e.code = body.code;
    e.detail = body.message;
    throw e;
  }
  return body;
}
export async function staff(req, c) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const r = await fetch(`${c.url}/auth/v1/user`, {
    headers: { apikey: c.key, Authorization: authorization },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const user = await r.json();
  const rows = await requestDb(
    c,
    `profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role,establishment_id&limit=1`,
  );
  const p = rows?.[0];
  return p &&
    (["direction", "administratif"].includes(p.role) ||
      (["restaurant", "reservation_staff"].includes(p.role) &&
        p.establishment_id === establishmentId))
    ? user
    : null;
}
export async function sendEmail(c, { to, subject, html, text, id }) {
  if (!c.resend) throw Error("Service e-mail indisponible");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.resend}`,
      "Content-Type": "application/json",
      "Idempotency-Key": id,
    },
    body: JSON.stringify({
      from:
        process.env.ROUE_FROM ||
        process.env.RESERVATION_FROM ||
        "La Maison du Parc <factures@reception.oddos.eu>",
      reply_to: "contact@lamaisonduparc-salles.fr",
      to: [to],
      subject,
      html,
      text,
    }),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok || !data.id) throw Error("Envoi indisponible");
  return data.id;
}
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export async function emailCoupon(c, row, origin) {
  const coupon = publicCoupon(row),
    url = `${origin}/jeu#bon=${coupon.code}`;
  const label = escapeHtml(coupon.label);
  const id = await sendEmail(c, {
    to: row.email,
    subject: "Votre cadeau — La Maison du Parc",
    id: `roue-bon-${row.id}`,
    text: `Bonjour ${row.name},\n\nVous avez gagné : ${coupon.label}.\nCode : ${coupon.code}\nVotre bon et son QR code : ${url}\nÀ présenter à La Maison du Parc jusqu’au 30 novembre 2026 inclus, selon les conditions du jeu. Ce bon est utilisable une seule fois.\n\nLa Maison du Parc — Parc du Château de Salles`,
    html: `<div style="background:#f5f1e8;padding:32px;font-family:Georgia,serif;color:#303a30"><p>LA MAISON DU PARC · LA MACHINE GOURMANDE</p><h1>Une belle occasion de nous retrouver.</h1><p>Bonjour ${escapeHtml(row.name)},</p><h2>${label}</h2><p>Votre code personnel : <strong>${coupon.code}</strong></p><p><a href="${url}">Afficher mon bon et son QR code</a></p><p>À présenter jusqu’au 30 novembre 2026 inclus. Bon à usage unique, selon les conditions du jeu.</p><p>La Maison du Parc · Parc du Château de Salles</p></div>`,
  });
  await requestDb(c, `wheel_entries?id=eq.${row.id}`, {
    method: "PATCH",
    body: JSON.stringify({ email_id: id, email_status: "sent" }),
  });
  return true;
}
export function safeError(error) {
  const m = error.detail || "";
  if (m.includes("WHEEL_NOT_OPEN"))
    return {
      message: "Le jeu est ouvert du 27 octobre au 27 novembre 2026 inclus.",
      status: 403,
    };
  if (m.includes("WHEEL_INACTIVE"))
    return {
      message: "Le jeu est en préparation. Revenez prochainement.",
      status: 503,
    };
  if (m.includes("WHEEL_RATE_LIMIT"))
    return {
      message: "Veuillez patienter avant de demander un nouveau lien.",
      status: 429,
    };
  if (m.includes("WHEEL_SOLD_OUT"))
    return {
      message:
        "Les 75 cadeaux ont été attribués. Merci pour votre participation.",
      status: 409,
    };
  if (m.includes("WHEEL_TICKET_INVALID"))
    return {
      message: "Ce gain temporaire ou ce lien a expiré. Vous pouvez rejouer.",
      status: 400,
    };
  return {
    message:
      "Le service est momentanément indisponible. Réessayez dans un instant.",
    status: 503,
  };
}
export { campaign };
