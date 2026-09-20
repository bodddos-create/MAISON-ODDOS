import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function configuration() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !secretKey || !resendKey) {
    throw new Error("Configuration serveur incomplète");
  }

  return { supabaseUrl, secretKey, resendKey };
}

async function requireManagement(request, config) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    const error = new Error("Non autorisé");
    error.status = 401;
    throw error;
  }

  const commonHeaders = {
    apikey: config.secretKey,
    Authorization: authorization,
  };
  const [userResponse, managementResponse] = await Promise.all([
    fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: commonHeaders,
      cache: "no-store",
    }),
    fetch(`${config.supabaseUrl}/rest/v1/rpc/is_management`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    }),
  ]);

  if (!userResponse.ok) {
    const error = new Error("Session expirée");
    error.status = 401;
    throw error;
  }

  const isManagement = managementResponse.ok
    ? await managementResponse.json()
    : false;

  if (isManagement !== true) {
    const error = new Error("Accès refusé");
    error.status = 403;
    throw error;
  }
}

async function supabaseGet(config, path) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Lecture du document impossible (${response.status})`);
  }

  return response.json();
}

async function resolveDocument(config, { invoiceId, importId }) {
  if (importId) {
    const rows = await supabaseGet(
      config,
      `invoice_imports?id=eq.${encodeURIComponent(importId)}&select=id,filename,document_path,analysis&limit=1`,
    );
    const item = rows?.[0];

    if (!item?.document_path) throw new Error("PDF original introuvable");

    return {
      path: item.document_path,
      filename: item.filename || "document-maison-oddos.pdf",
      supplier: item.analysis?.result?.supplier || "Maison Oddos",
      number: item.analysis?.result?.number || "",
    };
  }

  const invoices = await supabaseGet(
    config,
    `supplier_invoices?id=eq.${encodeURIComponent(invoiceId)}&select=id,document_path,supplier,invoice_number,document_type&limit=1`,
  );
  const invoice = invoices?.[0];

  if (!invoice?.document_path) throw new Error("PDF original introuvable");

  const imports = await supabaseGet(
    config,
    `invoice_imports?invoice_id=eq.${encodeURIComponent(invoice.id)}&document_path=eq.${encodeURIComponent(invoice.document_path)}&select=filename&order=created_at.desc&limit=1`,
  );

  return {
    path: invoice.document_path,
    filename: imports?.[0]?.filename || "document-maison-oddos.pdf",
    supplier: invoice.supplier || "Maison Oddos",
    number: invoice.invoice_number || "",
    documentType: invoice.document_type,
  };
}

async function downloadDocument(config, path) {
  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(
    `${config.supabaseUrl}/storage/v1/object/authenticated/accounting-documents/${encodedPath}`,
    {
      headers: {
        apikey: config.secretKey,
        Authorization: `Bearer ${config.secretKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Téléchargement du PDF impossible (${response.status})`);
  }

  return response.arrayBuffer();
}

export async function POST(request) {
  try {
    const config = configuration();
    await requireManagement(request, config);
    const { to, invoiceId, importId } = await request.json();
    const recipient = String(to || "")
      .trim()
      .toLowerCase();

    if (!emailPattern.test(recipient)) {
      return NextResponse.json(
        { error: "Adresse e-mail invalide" },
        { status: 400 },
      );
    }

    if (!invoiceId && !importId) {
      return NextResponse.json(
        { error: "Document non identifié" },
        { status: 400 },
      );
    }

    const document = await resolveDocument(config, { invoiceId, importId });
    const file = await downloadDocument(config, document.path);
    const label = document.documentType === "credit_note" ? "Avoir" : "Facture";
    const reference = document.number ? ` n° ${document.number}` : "";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `invoice-share-${invoiceId || importId}-${recipient}-${Date.now()}`,
      },
      body: JSON.stringify({
        from:
          process.env.INVOICE_SHARE_FROM ||
          "Maison Oddos <factures@reception.oddos.eu>",
        to: [recipient],
        subject: `${label}${reference} — ${document.supplier}`,
        text: `Bonjour,\n\nVeuillez trouver en pièce jointe le document ${document.supplier}${reference}.\n\nBien cordialement,\nMaison Oddos`,
        attachments: [
          {
            filename: document.filename,
            content: Buffer.from(file).toString("base64"),
          },
        ],
      }),
      cache: "no-store",
    });
    const responseText = await response.text();

    if (!response.ok) {
      console.error("invoice-share Resend", response.status, responseText);
      throw new Error("L’envoi du courriel a échoué");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("invoice-share", error);
    return NextResponse.json(
      { error: String(error?.message || "Envoi impossible") },
      { status: Number(error?.status) || 500 },
    );
  }
}
