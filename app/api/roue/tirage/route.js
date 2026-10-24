import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  campaign,
  config,
  hash,
  sameOrigin,
  requestDb,
  safeError,
} from "../../../../lib/roue-server";
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
        { error: "Participation invalide." },
        { status: 400 },
      );
    }
    if (data?.adult !== true || data?.rules !== true)
      return NextResponse.json(
        { error: "Confirmez votre majorité et les conditions du jeu." },
        { status: 400 },
      );
    const c = config();
    if (!c.resend)
      return NextResponse.json(
        { error: "Le jeu est en préparation." },
        { status: 503 },
      );
    const token = crypto.randomBytes(32).toString("hex"),
      ip =
        req.headers.get("x-vercel-forwarded-for") ||
        req.headers.get("x-forwarded-for") ||
        "unknown";
    const ipHash = crypto
      .createHmac("sha256", c.key)
      .update(ip.split(",")[0].trim())
      .digest("hex");
    const result = await requestDb(c, "rpc/wheel_spin", {
      method: "POST",
      body: JSON.stringify({
        p_campaign: campaign,
        p_token_hash: hash(token),
        p_ip_hash: ipHash,
      }),
    });
    return NextResponse.json(
      { ...result, winTicket: result.win ? token : null },
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
