import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publishableKey = "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuration() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) throw new Error("Configuration serveur incomplète");
  return { supabaseUrl, secretKey };
}

async function readResponse(response) {
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const details = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Supabase ${response.status}: ${details}`);
  }
  return body;
}

async function serviceRequest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  return readResponse(response);
}

async function requireManagement(request, config) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const userResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profiles = await serviceRequest(
    config,
    `/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,role&limit=1`,
  );
  return ["direction", "administratif"].includes(profiles?.[0]?.role) ? user : null;
}

async function listAuthUsers(config) {
  const body = await serviceRequest(config, "/auth/v1/admin/users?page=1&per_page=1000");
  return Array.isArray(body) ? body : (body?.users || []);
}

export async function GET(request) {
  try {
    const config = configuration();
    if (!await requireManagement(request, config)) {
      return NextResponse.json({ error: "Accès réservé à la direction." }, { status: 403 });
    }
    const [profiles, authUsers] = await Promise.all([
      serviceRequest(config, "/rest/v1/profiles?role=eq.reservation_staff&select=user_id,full_name,role,establishment_id,created_at&order=created_at.asc"),
      listAuthUsers(config),
    ]);
    const emailById = new Map(authUsers.map((user) => [user.id, user.email]));
    return NextResponse.json({
      users: (profiles || []).map((profile) => ({ ...profile, email: emailById.get(profile.user_id) || "" })),
    });
  } catch (error) {
    console.error("team users GET", error);
    return NextResponse.json({ error: "Impossible de charger les accès équipe." }, { status: 500 });
  }
}

export async function POST(request) {
  let createdUserId = null;
  try {
    const config = configuration();
    if (!await requireManagement(request, config)) {
      return NextResponse.json({ error: "Accès réservé à la direction." }, { status: 403 });
    }
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim().slice(0, 120);
    const establishmentId = String(body.establishment_id || "");
    if (!emailPattern.test(email) || password.length < 10 || fullName.length < 2 || !uuidPattern.test(establishmentId)) {
      return NextResponse.json({ error: "Vérifiez le nom, l’e-mail, le restaurant et le mot de passe (10 caractères minimum)." }, { status: 400 });
    }

    const authUser = await serviceRequest(config, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { maison_oddos_role: "reservation_staff" },
      }),
    });
    createdUserId = authUser?.id;
    if (!createdUserId) throw new Error("Identifiant du compte absent");

    const profiles = await serviceRequest(config, "/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: createdUserId,
        full_name: fullName,
        role: "reservation_staff",
        establishment_id: establishmentId,
      }),
    });
    return NextResponse.json({ ok: true, user: { ...profiles?.[0], email } });
  } catch (error) {
    console.error("team users POST", error);
    if (createdUserId) {
      try {
        const config = configuration();
        await serviceRequest(config, `/auth/v1/admin/users/${encodeURIComponent(createdUserId)}`, { method: "DELETE" });
      } catch (rollbackError) {
        console.error("team users rollback", rollbackError);
      }
    }
    const duplicate = String(error?.message || "").toLowerCase().includes("already") || String(error?.message || "").includes("422");
    return NextResponse.json({ error: duplicate ? "Cette adresse e-mail possède déjà un compte." : "Impossible de créer cet accès équipe." }, { status: duplicate ? 409 : 500 });
  }
}

export async function DELETE(request) {
  try {
    const config = configuration();
    if (!await requireManagement(request, config)) {
      return NextResponse.json({ error: "Accès réservé à la direction." }, { status: 403 });
    }
    const body = await request.json();
    const userId = String(body.user_id || "");
    if (!uuidPattern.test(userId)) {
      return NextResponse.json({ error: "Compte invalide." }, { status: 400 });
    }
    const profiles = await serviceRequest(
      config,
      `/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&role=eq.reservation_staff&select=user_id&limit=1`,
    );
    if (!profiles?.[0]) {
      return NextResponse.json({ error: "Compte équipe introuvable." }, { status: 404 });
    }
    await serviceRequest(config, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    return NextResponse.json({ ok: true, user_id: userId });
  } catch (error) {
    console.error("team users DELETE", error);
    return NextResponse.json({ error: "Impossible de supprimer cet accès équipe." }, { status: 500 });
  }
}
