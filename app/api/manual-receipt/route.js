import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const types = {
  "image/jpeg": { extension: "jpg", contentType: "image/jpeg" },
  "image/png": { extension: "png", contentType: "image/png" },
  "image/webp": { extension: "webp", contentType: "image/webp" },
  "image/heic": { extension: "heic", contentType: "image/heic" },
  "image/heif": { extension: "heic", contentType: "image/heic" },
};

const safeName = (value) =>
  String(value || "justificatif")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "justificatif";

function configuration() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("Configuration serveur incomplète");
  }
  return { supabaseUrl, secretKey };
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
      headers: { ...commonHeaders, "Content-Type": "application/json" },
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

async function supabaseRequest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Archivage impossible (${response.status})`);
  }
  return text ? JSON.parse(text) : null;
}

async function removeObject(config, path) {
  await fetch(`${config.supabaseUrl}/storage/v1/object/accounting-documents`, {
    method: "DELETE",
    headers: {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [path] }),
    cache: "no-store",
  });
}

export async function POST(request) {
  let storedPath = "";
  let config;
  try {
    config = configuration();
    await requireManagement(request, config);
    const form = await request.formData();
    const invoiceId = String(form.get("invoiceId") || "").trim();
    const file = form.get("file");
    if (!invoiceId || !file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { error: "Facture ou photo manquante" },
        { status: 400 },
      );
    }
    const media = types[String(file.type || "").toLowerCase()];
    if (!media) {
      return NextResponse.json(
        { error: "Utilisez une photo JPG, PNG, WEBP ou HEIC" },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "La photo dépasse 10 Mo" },
        { status: 400 },
      );
    }
    const invoices = await supabaseRequest(
      config,
      `supplier_invoices?id=eq.${encodeURIComponent(invoiceId)}&select=id,establishment_id,invoice_date,supplier,category&limit=1`,
      { method: "GET" },
    );
    const invoice = invoices?.[0];
    if (!invoice) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    }
    const year = String(invoice.invoice_date || new Date().getUTCFullYear()).slice(
      0,
      4,
    );
    const filename = `${safeName(invoice.category)}-${safeName(invoice.supplier)}-${invoice.invoice_date}-${invoice.id.slice(0, 8)}.${media.extension}`;
    storedPath = `invoices/manual/${invoice.establishment_id}/${year}/${filename}`;
    const encodedPath = storedPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const upload = await fetch(
      `${config.supabaseUrl}/storage/v1/object/accounting-documents/${encodedPath}`,
      {
        method: "POST",
        headers: {
          apikey: config.secretKey,
          Authorization: `Bearer ${config.secretKey}`,
          "Content-Type": media.contentType,
          "x-upsert": "false",
        },
        body: await file.arrayBuffer(),
        cache: "no-store",
      },
    );
    if (!upload.ok) {
      throw new Error(`Enregistrement de la photo impossible (${upload.status})`);
    }
    await supabaseRequest(
      config,
      `supplier_invoices?id=eq.${encodeURIComponent(invoice.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ document_path: storedPath }),
      },
    );
    return NextResponse.json({ ok: true, documentPath: storedPath });
  } catch (error) {
    if (storedPath && config) await removeObject(config, storedPath);
    console.error("manual-receipt", error);
    return NextResponse.json(
      { error: String(error?.message || "Archivage impossible") },
      { status: Number(error?.status) || 500 },
    );
  }
}
