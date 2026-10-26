import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { restaurants, validateEnquiry } from '../../../lib/group-enquiries.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !process.env.RESEND_API_KEY) throw new Error('Configuration indisponible');
  return { url, key };
}
async function db(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, cache: 'no-store', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`Database ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function staff(request) {
  const token = request.headers.get('authorization');
  if (!token?.startsWith('Bearer ')) return null;
  const { url, key } = config();
  const auth = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: token }, cache: 'no-store' });
  if (!auth.ok) return null;
  const user = await auth.json();
  const profiles = await db(`profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role,establishment_id&limit=1`);
  const profile = profiles[0];
  if (!profile || !['direction', 'administratif', 'restaurant', 'reservation_staff'].includes(profile.role)) return null;
  return { ...profile, management: ['direction', 'administratif'].includes(profile.role) };
}
async function notify(row) {
  const restaurant = restaurants[row.restaurant];
  const date = new Date(`${row.event_date}T12:00:00Z`).toLocaleDateString('fr-FR');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `group-enquiry-${row.id}` },
      body: JSON.stringify({
        from: process.env.RESERVATION_FROM || 'Maison Oddos <factures@reception.oddos.eu>',
        to: [restaurant.email], reply_to: row.email,
        subject: `Demande de groupe — ${restaurant.name} — ${date}`,
        text: `NOUVELLE DEMANDE DE GROUPE / PRIVATISATION\n\nRestaurant : ${restaurant.name}\nDate : ${date}\nDébut : ${row.start_time}\nFin : ${row.end_time || 'Non précisée'}\nFlexibilité : ${row.flexibility}\nPersonnes : ${row.guests}\nÉvénement : ${row.occasion}\n\nNom : ${row.full_name}\nEntreprise / association : ${row.company || '—'}\nE-mail : ${row.email}\nTéléphone : ${row.phone}\nBudget : ${row.budget || 'À discuter'}\n\nProjet :\n${row.message || '—'}\n\nRéférence : ${row.id}\nSuivi dans Pilotage : https://pilotage.oddos.eu/demandes-groupes\nCette demande ne constitue pas une réservation confirmée.`,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error(`Resend ${response.status}`);
    await db(`group_enquiries?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ notification_status: 'sent', notification_id: result.id }) });
    return true;
  } catch {
    await db(`group_enquiries?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ notification_status: 'failed' }) }).catch(() => {});
    return false;
  }
}
export async function POST(request) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 20000) return json({ error: 'Message trop long.' }, 413);
    const origin = request.headers.get('origin');
    if (!origin || !['https://pilotage.oddos.eu', 'https://maison-oddos.vercel.app', new URL(request.url).origin].includes(origin)) return json({ error: 'Origine non autorisée.' }, 403);
    const raw = await request.text();
    if (raw.length > 20000) return json({ error: 'Message trop long.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Requête invalide.' }, 400); }
    if (body.website || !Number.isFinite(body.started_at) || Date.now() - body.started_at < 2500) return json({ error: 'Veuillez patienter puis réessayer.' }, 400);
    const { data, errors, valid } = validateEnquiry(body);
    if (!valid) return json({ error: 'Vérifiez les champs indiqués.', errors }, 400);
    if (!/^[a-f0-9-]{36}$/.test(body.request_id || '')) return json({ error: 'Rechargez le formulaire.' }, 400);
    const existing = await db(`group_enquiries?request_id=eq.${body.request_id}&select=id&limit=1`);
    if (existing.length) return json({ ok: true, reference: existing[0].id });
    const hour = encodeURIComponent(new Date(Date.now() - 3600000).toISOString());
    const recent = await db(`group_enquiries?email=eq.${encodeURIComponent(data.email)}&created_at=gte.${hour}&select=id&limit=5`);
    if (recent.length >= 5) return json({ error: 'Votre demande a déjà été reçue. Contactez directement le restaurant pour un complément.' }, 429);
    const record = { id: crypto.randomUUID(), request_id: body.request_id, ...data, end_time: data.end_time || null, establishment_id: restaurants[data.restaurant].establishmentId, privacy_accepted_at: new Date().toISOString() };
    // A unique request_id prevents two records from a double click or network retry.
    let rows;
    try { rows = await db('group_enquiries?on_conflict=request_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(record) }); }
    catch { return json({ error: 'L’enregistrement a échoué. Merci de réessayer ou de contacter le restaurant.' }, 503); }
    if (!rows?.length) {
      const duplicate = await db(`group_enquiries?request_id=eq.${body.request_id}&select=id&limit=1`);
      return json({ ok: true, reference: duplicate[0].id });
    }
    const emailed = await notify(rows[0]);
    return json({ ok: true, reference: rows[0].id, email_sent: emailed });
  } catch { return json({ error: 'Le formulaire est momentanément indisponible. Contactez le restaurant par téléphone ou par e-mail.' }, 503); }
}
export async function GET(request) {
  try {
    const profile = await staff(request);
    if (!profile) return json({ error: 'Connexion requise.' }, 401);
    if (!profile.management && !profile.establishment_id) return json({ error: 'Accès non autorisé.' }, 403);
    const scope = profile.management ? '' : `&establishment_id=eq.${encodeURIComponent(profile.establishment_id)}`;
    return json({ enquiries: await db(`group_enquiries?select=*&order=created_at.desc&limit=300${scope}`) });
  } catch { return json({ error: 'Impossible de charger les demandes.' }, 503); }
}
export async function PATCH(request) {
  try {
    const profile = await staff(request);
    if (!profile) return json({ error: 'Connexion requise.' }, 401);
    const body = await request.json();
    if (!/^[a-f0-9-]{36}$/.test(body.id || '')) return json({ error: 'Demande invalide.' }, 400);
    const rows = await db(`group_enquiries?id=eq.${body.id}&select=*&limit=1`);
    const row = rows[0];
    if (!row || (!profile.management && row.establishment_id !== profile.establishment_id)) return json({ error: 'Accès non autorisé.' }, 403);
    if (body.retry_email === true) return json({ ok: await notify(row) });
    if (!['new', 'contacted', 'quoted', 'confirmed', 'closed'].includes(body.status)) return json({ error: 'Statut invalide.' }, 400);
    await db(`group_enquiries?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: body.status }) });
    return json({ ok: true });
  } catch { return json({ error: 'La mise à jour a échoué.' }, 503); }
}
