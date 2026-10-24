import { NextResponse } from "next/server";
import {
  campaign,
  config,
  sameOrigin,
  requestDb,
  staff,
  emailCoupon,
} from "../../../../lib/roue-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  try {
    const c = config();
    if (!(await staff(req, c)))
      return NextResponse.json(
        { error: "Accès réservé à l’équipe autorisée." },
        { status: 403 },
      );
    const entries = await requestDb(
      c,
      `wheel_entries?campaign=eq.${campaign}&select=id,email,name,prize,code,consent,consent_text,created_at,expires_at,used_at,email_status&order=created_at.desc&limit=100`,
    );
    return NextResponse.json(
      { entries },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Chargement indisponible." },
      { status: 503 },
    );
  }
}
export async function PATCH(req) {
  try {
    if (!sameOrigin(req))
      return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
    const c = config(),
      user = await staff(req, c);
    if (!user)
      return NextResponse.json(
        { error: "Accès réservé à l’équipe autorisée." },
        { status: 403 },
      );
    const data = await req.json();
    if (
      !/^[a-f0-9-]{36}$/i.test(data?.id || "") ||
      !["redeem", "resend"].includes(data?.action)
    )
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    if (data.action === "redeem") {
      const rows = await requestDb(
        c,
        `wheel_entries?campaign=eq.${campaign}&id=eq.${data.id}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            used_at: new Date().toISOString(),
            used_by: user.id,
          }),
        },
      );
      return NextResponse.json(
        { updated: rows.length === 1 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const rows = await requestDb(
      c,
      `wheel_entries?campaign=eq.${campaign}&id=eq.${data.id}&select=*&limit=1`,
    );
    if (!rows?.[0])
      return NextResponse.json({ error: "Bon introuvable." }, { status: 404 });
    if (rows[0].email_status === "sent")
      return NextResponse.json(
        {
          error:
            "Le bon a déjà été envoyé. Son code reste consultable dans le suivi.",
        },
        { status: 409 },
      );
    await emailCoupon(c, rows[0], new URL(req.url).origin);
    return NextResponse.json(
      { emailSent: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Action momentanément indisponible." },
      { status: 503 },
    );
  }
}
