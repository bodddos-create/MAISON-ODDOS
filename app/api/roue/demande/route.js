import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  campaign,
  config,
  hash,
  sameOrigin,
  requestDb,
  sendEmail,
  safeError,
} from "../../../../lib/roue-server";
import { consentText } from "../../../../lib/roue-config";
export const runtime = "nodejs";
export async function POST(req) {
  try {
    if (!sameOrigin(req))
      return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
    let data;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Formulaire invalide." },
        { status: 400 },
      );
    }
    const email = String(data?.email || "")
        .trim()
        .toLowerCase(),
      name = String(data?.name || "").trim();
    if (
      data?.website ||
      !name ||
      name.length > 70 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      data?.rules !== true ||
      data?.adult !== true ||
      typeof data?.consent !== "boolean" ||
      !/^[a-f0-9]{64}$/.test(data?.winTicket || "")
    )
      return NextResponse.json(
        { error: "Vérifiez les champs et les conditions de participation." },
        { status: 400 },
      );
    const c = config();
    if (!c.resend)
      return NextResponse.json(
        { error: "Le jeu est en préparation." },
        { status: 503 },
      );
    const token = crypto.randomBytes(32).toString("hex");
    const ip =
      req.headers.get("x-vercel-forwarded-for") ||
      req.headers.get("x-forwarded-for") ||
      "unknown";
    const ipHash = crypto
      .createHmac("sha256", c.key)
      .update(ip.split(",")[0].trim())
      .digest("hex");
    const result = await requestDb(c, "rpc/wheel_request_ticket", {
      method: "POST",
      body: JSON.stringify({
        p_campaign: campaign,
        p_email: email,
        p_name: name,
        p_consent: data.consent,
        p_consent_text: data.consent ? consentText : "",
        p_token_hash: hash(token),
        p_ip_hash: ipHash,
        p_win_hash: hash(data.winTicket),
      }),
    });
    const link = `${new URL(req.url).origin}/jeu#ticket=${token}`;
    await sendEmail(c, {
      to: email,
      subject: "Votre lien pour la Machine Gourmande — La Maison du Parc",
      id: `roue-ticket-${result.id}`,
      text: `Bonjour ${name},\n\nVotre adresse e-mail est associée à votre participation. Ouvrez ce lien pour récupérer votre bon :\n${link}\n\nLe lot est réservé 15 minutes après le gain. Un seul cadeau par adresse e-mail vérifiée.\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
      html: `<p>LA MAISON DU PARC · LA MACHINE GOURMANDE</p><h1>Votre surprise vous attend.</h1><p><a href="${link}">Confirmer mon e-mail et récupérer mon bon</a></p><p>Lot réservé 15 minutes après le gain. Un seul cadeau par adresse e-mail vérifiée. Si vous n’avez pas demandé ce lien, ignorez ce message.</p>`,
    });
    return NextResponse.json(
      {
        ok: true,
        message:
          "Votre lien personnel a été envoyé. Consultez votre boîte mail, puis ouvrez-le pour récupérer votre bon.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const error = safeError(e);
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
}
