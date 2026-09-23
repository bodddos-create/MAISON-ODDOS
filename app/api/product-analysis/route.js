import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const publishableKey = "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const allowedCategories = new Set(["Formule", "Entrée", "Plat", "Dessert", "Boisson", "Supplément", "Autre"]);
const allowedSaleTypes = new Set(["formula", "component", "standalone", "unknown"]);

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
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const user = await response.json();
  const profiles = await serviceRequest(
    config,
    `/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,role&limit=1`,
  );
  return ["direction", "administratif"].includes(profiles?.[0]?.role) ? user : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizedLabel(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 180);
}

function safeFilename(value) {
  return String(value || "rapport-z.pdf")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function periodEnd(date, type) {
  const [year, month, day] = String(date).split("-").map(Number);
  if (type === "year") return `${year}-12-31`;
  if (type === "month") {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function downloadArchivedDocument(config, path, filename) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
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
    throw new Error(`Téléchargement du Z archivé impossible : ${response.status}`);
  }
  return new File(
    [await response.arrayBuffer()],
    filename || "rapport-z.pdf",
    { type: response.headers.get("content-type") || "application/pdf" },
  );
}

async function resolveArchivedDocument(config, source) {
  const [kind, id] = String(source || "").split(":");
  if (!["daily", "history"].includes(kind) || !uuidPattern.test(id || "")) {
    throw new Error("Z archivé invalide");
  }

  if (kind === "daily") {
    const rows = await serviceRequest(
      config,
      `/rest/v1/daily_sales?id=eq.${encodeURIComponent(id)}&select=id,establishment_id,business_date,z_document_path,z_document_name&limit=1`,
    );
    const row = rows?.[0];
    if (!row?.z_document_path) throw new Error("PDF du Z introuvable");
    return {
      establishmentId: row.establishment_id,
      periodStart: row.business_date,
      periodEnd: row.business_date,
      path: row.z_document_path,
      filename: row.z_document_name || "rapport-z.pdf",
    };
  }

  const selectedRows = await serviceRequest(
    config,
    `/rest/v1/historical_ca?id=eq.${encodeURIComponent(id)}&select=id,establishment_id,period_start,period_type,source_document_path,source_filename&limit=1`,
  );
  const selected = selectedRows?.[0];
  if (!selected?.source_document_path) throw new Error("PDF historique introuvable");
  const related = await serviceRequest(
    config,
    `/rest/v1/historical_ca?source_document_path=eq.${encodeURIComponent(selected.source_document_path)}&establishment_id=eq.${encodeURIComponent(selected.establishment_id)}&select=period_start,period_type`,
  );
  const starts = (related || []).map((row) => row.period_start).filter(Boolean).sort();
  const ends = (related || [])
    .map((row) => periodEnd(row.period_start, row.period_type))
    .filter(Boolean)
    .sort();
  return {
    establishmentId: selected.establishment_id,
    periodStart: starts[0] || selected.period_start,
    periodEnd: ends.at(-1) || periodEnd(selected.period_start, selected.period_type),
    path: selected.source_document_path,
    filename: selected.source_filename || "rapport-z-historique.pdf",
  };
}

async function archiveDocument(config, file, periodStart) {
  const folder = periodStart.slice(0, 7);
  const path = `product-analysis/${folder}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `${config.supabaseUrl}/storage/v1/object/accounting-documents/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: config.secretKey,
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: await file.arrayBuffer(),
    },
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Archivage du document impossible : ${details}`);
  }
  return path;
}

export async function POST(request) {
  let runId = null;
  try {
    const config = configuration();
    const user = await requireManagement(request, config);
    if (!user) {
      return NextResponse.json({ error: "Accès réservé à la direction." }, { status: 403 });
    }

    const form = await request.formData();
    const archivedSource = String(form.get("existing_source") || "");
    let file = form.get("file");
    let establishmentId = String(form.get("establishment_id") || "");
    let periodStart = String(form.get("period_start") || "");
    let periodEndValue = String(form.get("period_end") || "");
    let documentPath = "";

    if (archivedSource) {
      const archived = await resolveArchivedDocument(config, archivedSource);
      establishmentId = archived.establishmentId;
      periodStart = archived.periodStart;
      periodEndValue = archived.periodEnd;
      documentPath = archived.path;

      const existingRuns = await serviceRequest(
        config,
        `/rest/v1/product_analysis_runs?source_document_path=eq.${encodeURIComponent(documentPath)}&select=id,line_count&order=created_at.desc&limit=1`,
      );
      if (existingRuns?.[0]) {
        return NextResponse.json({
          ok: true,
          already_analyzed: true,
          analysis_id: existingRuns[0].id,
          line_count: existingRuns[0].line_count,
        });
      }
      file = await downloadArchivedDocument(config, archived.path, archived.filename);
    }

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Sélectionnez un Z détaillé." }, { status: 400 });
    }
    if (!uuidPattern.test(establishmentId) || !datePattern.test(periodStart) || !datePattern.test(periodEndValue) || periodEndValue < periodStart) {
      return NextResponse.json({ error: "Restaurant ou période invalide." }, { status: 400 });
    }
    const mediaType = String(file.type || "").toLowerCase();
    const isPdf = mediaType === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
    const isImage = mediaType.startsWith("image/");
    if (!isPdf && !isImage) {
      return NextResponse.json({ error: "Utilisez un PDF ou une image." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Document trop volumineux (10 Mo maximum)." }, { status: 400 });
    }

    const scanForm = new FormData();
    scanForm.append("file", file, file.name || "rapport-z.pdf");
    scanForm.append("type", "z_products");
    const scanResponse = await fetch(new URL("/api/scan-ai", request.url), {
      method: "POST",
      body: scanForm,
      cache: "no-store",
    });
    const scanText = await scanResponse.text();
    let analysis;
    try { analysis = JSON.parse(scanText); } catch { analysis = null; }
    if (!scanResponse.ok || !analysis?.result) {
      const message = analysis?.error || "Lecture du Z détaillé impossible.";
      return NextResponse.json({ error: message }, { status: scanResponse.status || 502 });
    }

    const products = (Array.isArray(analysis.result.products) ? analysis.result.products : [])
      .map((item) => {
        const label = String(item.rawLabel || "").trim().slice(0, 180);
        const quantity = numberOrNull(item.quantity);
        const salesTtc = numberOrNull(item.salesTtc);
        if (!label || ((quantity == null || quantity <= 0) && (salesTtc == null || salesTtc <= 0))) return null;
        return {
          raw_label: label,
          normalized_label: normalizedLabel(label),
          category: allowedCategories.has(item.category) ? item.category : "Autre",
          sale_type: allowedSaleTypes.has(item.saleType) ? item.saleType : "unknown",
          quantity: quantity == null ? 0 : round(quantity, 3),
          unit_price_ttc: numberOrNull(item.unitPriceTtc) == null ? null : round(item.unitPriceTtc),
          sales_ttc: salesTtc == null ? null : round(salesTtc),
          discounts_ttc: numberOrNull(item.discountsTtc) == null ? 0 : round(item.discountsTtc),
          offered_quantity: numberOrNull(item.offeredQuantity) == null ? 0 : round(item.offeredQuantity, 3),
          cancelled_quantity: numberOrNull(item.cancelledQuantity) == null ? 0 : round(item.cancelledQuantity, 3),
          confidence: numberOrNull(item.confidence) == null ? null : Math.max(0, Math.min(1, Number(item.confidence))),
        };
      })
      .filter(Boolean);

    if (!products.length) {
      return NextResponse.json(
        { error: "Aucune ligne de produit exploitable n’a été trouvée. Utilisez un Z avec le détail des articles vendus." },
        { status: 422 },
      );
    }

    if (!documentPath) {
      documentPath = await archiveDocument(config, file, periodStart);
    }
    const confidences = products.map((item) => item.confidence).filter(Number.isFinite);
    const confidence = confidences.length
      ? round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length, 4)
      : null;

    const runs = await serviceRequest(config, "/rest/v1/product_analysis_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        establishment_id: establishmentId,
        period_start: periodStart,
        period_end: periodEndValue,
        source_filename: file.name || "rapport-z.pdf",
        source_document_path: documentPath,
        status: "analyzed",
        confidence,
        line_count: products.length,
        created_by: user.id,
      }),
    });
    runId = runs?.[0]?.id;
    if (!runId) throw new Error("Identifiant de l’analyse absent");

    await serviceRequest(config, "/rest/v1/product_sales_lines", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(products.map((item) => ({
        analysis_id: runId,
        establishment_id: establishmentId,
        period_start: periodStart,
        period_end: periodEndValue,
        ...item,
      }))),
    });

    return NextResponse.json({
      ok: true,
      analysis_id: runId,
      line_count: products.length,
      restaurant: analysis.result.restaurant || "",
      period_start: periodStart,
      period_end: periodEndValue,
    });
  } catch (error) {
    console.error("product analysis", error);
    if (runId) {
      try {
        const config = configuration();
        await serviceRequest(config, `/rest/v1/product_analysis_runs?id=eq.${encodeURIComponent(runId)}`, { method: "DELETE" });
      } catch (rollbackError) {
        console.error("product analysis rollback", rollbackError);
      }
    }
    return NextResponse.json(
      { error: "Analyse produits impossible.", details: String(error?.message || error) },
      { status: 500 },
    );
  }
}
