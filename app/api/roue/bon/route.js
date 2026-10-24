import { NextResponse } from "next/server";
import {
  campaign,
  config,
  sameOrigin,
  requestDb,
} from "../../../../lib/roue-server";
import { parseCode, publicCoupon } from "../../../../lib/roue-config";
export const runtime = "nodejs";
export async function POST(req) {
  try {
    if (!sameOrigin(req))
      return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
    const data = await req.json();
    const code = parseCode(data?.code);
    if (!code)
      return NextResponse.json({ error: "Code invalide." }, { status: 400 });
    const rows = await requestDb(
      config(),
      `wheel_entries?campaign=eq.${campaign}&code=eq.${code}&select=code,prize,expires_at,used_at&limit=1`,
    );
    if (!rows?.[0])
      return NextResponse.json({ error: "Bon introuvable." }, { status: 404 });
    return NextResponse.json(publicCoupon(rows[0]), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Vérification momentanément indisponible." },
      { status: 503 },
    );
  }
}
