import { NextResponse } from "next/server";
import {
  campaign,
  config,
  hash,
  sameOrigin,
  requestDb,
  emailCoupon,
  safeError,
} from "../../../../lib/roue-server";
import { publicCoupon } from "../../../../lib/roue-config";
export const runtime = "nodejs";
export async function POST(req) {
  try {
    if (!sameOrigin(req))
      return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
    let data;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
    }
    if (!/^[a-f0-9]{64}$/.test(data?.ticket || ""))
      return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
    const c = config();
    const row = await requestDb(c, "rpc/wheel_claim", {
      method: "POST",
      body: JSON.stringify({
        p_campaign: campaign,
        p_token_hash: hash(data.ticket),
      }),
    });
    let emailSent = row.email_status === "sent";
    if (!emailSent) {
      try {
        emailSent = await emailCoupon(c, row, new URL(req.url).origin);
      } catch {
        await requestDb(c, `wheel_entries?id=eq.${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ email_status: "failed" }),
        }).catch(() => {});
      }
    }
    return NextResponse.json(
      { ...publicCoupon(row), emailSent },
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
