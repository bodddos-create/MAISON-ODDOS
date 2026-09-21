import { processInvoiceEmail } from "./invoice";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const toNumber = (value) => {
  const number = Number(
    String(value ?? "")
      .replace(/\s/g, "")
      .replace(",", "."),
  );

  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const safePathPart = (value) =>
  String(value || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "document";

function detectRestaurant(value) {
  const text = clean(value);

  if (text.includes("villa valleyre") || text.includes("valleyre")) {
    return {
      name: "Villa Valleyre",
      establishment_id: "8395bf22-99cb-4a7b-9096-ca734d583d83",
    };
  }

  if (text.includes("maison du parc") || text.includes("salles")) {
    return {
      name: "La Maison du Parc",
      establishment_id: "55c6e880-aa0c-40d6-9065-b5315b1a602a",
    };
  }

  return null;
}

async function resendGet(path) {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    cache: "no-store",
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");

  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SECRET_KEY absente");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();

  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`,
    );
  }

  return body;
}

async function upsertZImport({
  emailId,
  attachmentId,
  filename,
  status,
  reason = null,
  analysis = null,
  dailySaleId = null,
  documentPath = null,
}) {
  if (!emailId || !attachmentId || !filename) return;

  await supabaseRequest("z_imports?on_conflict=email_id,attachment_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      email_id: emailId,
      attachment_id: attachmentId,
      filename,
      status,
      reason,
      analysis,
      daily_sale_id: dailySaleId,
      document_path: documentPath,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function storeZDocument({ emailId, attachmentId, filename, buffer }) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SECRET_KEY absente");
  }

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const documentPath = `z-reports/${month}/${safePathPart(emailId)}/${safePathPart(attachmentId)}-${safePathPart(filename)}`;
  const encodedPath = documentPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/accounting-documents/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
      },
      body: buffer,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Archivage du Z impossible : ${response.status} ${details}`,
    );
  }

  return documentPath;
}

function calculateConfidence(result) {
  const confidence = result?.confidence || {};

  const values = [confidence.restaurant, confidence.date, confidence.ca]
    .map(Number)
    .filter(Number.isFinite);

  if (!values.length) return null;

  return Math.max(
    0,
    Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length),
  );
}

const RESTAURANTS = [
  {
    name: "Villa Valleyre",
    establishment_id: "8395bf22-99cb-4a7b-9096-ca734d583d83",
  },
  {
    name: "La Maison du Parc",
    establishment_id: "55c6e880-aa0c-40d6-9065-b5315b1a602a",
  },
];

async function inferRestaurantFromExistingSale(businessDate, incomingTtc) {
  if (!(incomingTtc > 0)) return null;

  const rows =
    (await supabaseRequest(
      `daily_sales?business_date=eq.${encodeURIComponent(
        businessDate,
      )}&select=id,establishment_id&limit=3`,
      { method: "GET" },
    )) || [];

  if (rows.length !== 1) return null;

  const existing = rows[0];
  const knownRestaurant = RESTAURANTS.find(
    (item) => item.establishment_id === existing.establishment_id,
  );

  if (!knownRestaurant) return null;

  const vatLines =
    (await supabaseRequest(
      `daily_sale_vat_lines?daily_sale_id=eq.${encodeURIComponent(
        existing.id,
      )}&select=amount_ttc`,
      { method: "GET" },
    )) || [];
  const existingTtc = roundMoney(
    vatLines.reduce((sum, line) => sum + toNumber(line.amount_ttc), 0),
  );
  const isSameReport =
    existingTtc > 0 && Math.abs(existingTtc - incomingTtc) <= 0.02;

  return isSameReport
    ? knownRestaurant
    : RESTAURANTS.find(
        (item) => item.establishment_id !== existing.establishment_id,
      ) || null;
}

function normalizeBusinessDate(value) {
  const raw = String(value || "").trim();
  let year;
  let month;
  let day;

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (match) {
    [, year, month, day] = match;
  } else {
    match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!match) return "";
    [, day, month, year] = match;
  }

  const normalized = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return "";
  }

  return normalized;
}

async function saveZReport({ restaurant, filename, documentPath, analysis }) {
  const result = analysis?.result;

  if (!result) {
    throw new Error("Résultat de l’analyse IA absent");
  }

  const businessDate = normalizeBusinessDate(result.date);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return {
      saved: false,
      needs_review: true,
      reason: "Date du Z absente ou invalide",
    };
  }

  let resolvedRestaurant = restaurant || detectRestaurant(result.restaurant);

  if (!resolvedRestaurant) {
    resolvedRestaurant = await inferRestaurantFromExistingSale(
      businessDate,
      roundMoney(toNumber(result.ca)),
    );

    if (resolvedRestaurant) {
      console.warn(
        JSON.stringify({
          level: "warning",
          message: "Restaurant déduit par comparaison des Z de la journée",
          businessDate,
          restaurant: resolvedRestaurant.name,
        }),
      );
    }
  }

  if (!resolvedRestaurant) {
    return {
      saved: false,
      needs_review: true,
      reason: "Restaurant non identifié",
    };
  }

  const vatLines = Array.isArray(result.vatLines)
    ? result.vatLines
        .map((line) => ({
          vat_rate: toNumber(line.vat_rate),
          amount_ht: roundMoney(toNumber(line.amount_ht)),
          vat_amount: roundMoney(toNumber(line.vat_amount)),
          amount_ttc: roundMoney(toNumber(line.amount_ttc)),
        }))
        .filter(
          (line) =>
            line.vat_rate >= 0 && line.amount_ht >= 0 && line.amount_ttc > 0,
        )
    : [];

  if (!vatLines.length) {
    return {
      saved: false,
      needs_review: true,
      reason: "Ventilation TVA absente ou illisible",
    };
  }

  const totalHt = roundMoney(
    vatLines.reduce((sum, line) => sum + line.amount_ht, 0),
  );

  if (totalHt <= 0) {
    return {
      saved: false,
      needs_review: true,
      reason: "Total HT invalide",
    };
  }

  const lunch = toNumber(result.lunch);
  const dinner = toNumber(result.dinner);
  const splitTotal = lunch + dinner;

  let lunchSalesHt = totalHt;
  let dinnerSalesHt = 0;

  if (lunch > 0 && dinner > 0 && splitTotal > 0) {
    lunchSalesHt = roundMoney(totalHt * (lunch / splitTotal));
    dinnerSalesHt = roundMoney(totalHt - lunchSalesHt);
  }

  const covers = Math.max(0, Math.round(toNumber(result.covers)));

  const confidence = calculateConfidence(result);

  const establishmentFilter = encodeURIComponent(
    resolvedRestaurant.establishment_id,
  );
  const dateFilter = encodeURIComponent(businessDate);

  const existingRows =
    (await supabaseRequest(
      `daily_sales?establishment_id=eq.${establishmentFilter}&business_date=eq.${dateFilter}&select=id,z_scan_status,z_document_path&limit=1`,
      {
        method: "GET",
      },
    )) || [];

  const existing = existingRows[0] || null;

  if (existing?.z_scan_status === "validated") {
    await supabaseRequest(
      `daily_sales?id=eq.${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          z_document_path: documentPath,
          z_document_name: filename,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    return {
      saved: false,
      needs_review: false,
      already_validated: true,
      daily_sale_id: existing.id,
      reason: "Ce Z a déjà été validé manuellement",
    };
  }

  const salePayload = {
    establishment_id: resolvedRestaurant.establishment_id,
    business_date: businessDate,
    lunch_sales_ht: lunchSalesHt,
    dinner_sales_ht: dinnerSalesHt,
    lunch_covers: covers,
    dinner_covers: 0,
    z_document_path: documentPath,
    z_document_name: filename,
    z_scan_status: "analyzed",
    z_scan_confidence: confidence,
    updated_at: new Date().toISOString(),
  };

  let dailySale;

  if (existing) {
    const updatedRows = await supabaseRequest(
      `daily_sales?id=eq.${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(salePayload),
      },
    );

    dailySale = updatedRows?.[0];
  } else {
    const insertedRows = await supabaseRequest("daily_sales", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(salePayload),
    });

    dailySale = insertedRows?.[0];
  }

  if (!dailySale?.id) {
    throw new Error("Supabase n’a pas retourné l’identifiant de la vente");
  }

  await supabaseRequest(
    `daily_sale_vat_lines?daily_sale_id=eq.${encodeURIComponent(dailySale.id)}`,
    {
      method: "DELETE",
    },
  );

  await supabaseRequest("daily_sale_vat_lines", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(
      vatLines.map((line) => ({
        daily_sale_id: dailySale.id,
        ...line,
      })),
    ),
  });

  return {
    saved: true,
    needs_review: false,
    daily_sale_id: dailySale.id,
    business_date: businessDate,
    total_ht: totalHt,
    total_ttc: roundMoney(toNumber(result.ca)),
    covers,
    vat_lines_saved: vatLines.length,
    document_path: documentPath,
  };
}

async function saveHistoricalZ({
  restaurant,
  filename,
  documentPath,
  emailId,
  analysis,
}) {
  const result = analysis?.result;
  const resolvedRestaurant = restaurant || detectRestaurant(result?.restaurant);
  const year = Number(result?.year);

  if (!resolvedRestaurant) {
    return { saved: false, needs_review: true, reason: "Restaurant non identifié" };
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { saved: false, needs_review: true, reason: "Année absente ou invalide" };
  }

  const rows = [];
  const periodStart = String(result?.periodStart || "");
  const periodEnd = String(result?.periodEnd || "");
  const reportTotalTtc = roundMoney(toNumber(result?.reportTotalTtc));
  const datesAreValid =
    /^\d{4}-\d{2}-\d{2}$/.test(periodStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) &&
    periodStart.startsWith(`${year}-`) &&
    periodEnd.startsWith(`${year}-`);
  let reportPeriodType = "";
  let reportPeriodStart = "";

  if (datesAreValid && periodStart === periodEnd) {
    reportPeriodType = "day";
    reportPeriodStart = periodStart;
  } else if (
    datesAreValid &&
    periodStart.slice(0, 7) === periodEnd.slice(0, 7)
  ) {
    reportPeriodType = "month";
    reportPeriodStart = `${periodStart.slice(0, 7)}-01`;
  } else if (
    datesAreValid &&
    periodStart === `${year}-01-01` &&
    periodEnd === `${year}-12-31`
  ) {
    reportPeriodType = "year";
    reportPeriodStart = `${year}-01-01`;
  }

  if (reportTotalTtc > 0 && reportPeriodType) {
    rows.push({
      establishment_id: resolvedRestaurant.establishment_id,
      period_start: reportPeriodStart,
      period_type: reportPeriodType,
      amount_ttc: reportTotalTtc,
      covers: toNumber(result?.reportCovers) > 0
        ? Math.round(toNumber(result.reportCovers))
        : null,
      confidence: Number(result?.confidence?.reportTotalTtc) || null,
      source_document_path: documentPath,
      source_filename: filename,
      source_email_id: emailId,
      updated_at: new Date().toISOString(),
    });
  }

  for (const period of Array.isArray(result?.periods) ? result.periods : []) {
    const periodType = period?.granularity;
    const date = String(period?.date || "");
    const amountTtc = roundMoney(toNumber(period?.ttc));
    const validDate =
      periodType === "day"
        ? /^\d{4}-\d{2}-\d{2}$/.test(date)
        : periodType === "month" && /^\d{4}-\d{2}-01$/.test(date);
    if (!validDate || !date.startsWith(`${year}-`) || amountTtc <= 0) continue;
    rows.push({
      establishment_id: resolvedRestaurant.establishment_id,
      period_start: date,
      period_type: periodType,
      amount_ttc: amountTtc,
      covers: toNumber(period?.covers) > 0
        ? Math.round(toNumber(period.covers))
        : null,
      confidence: Number(period?.confidence) || null,
      source_document_path: documentPath,
      source_filename: filename,
      source_email_id: emailId,
      updated_at: new Date().toISOString(),
    });
  }

  if (!rows.length) {
    return {
      saved: false,
      needs_review: true,
      reason: "Aucun total historique lisible",
    };
  }

  const uniqueRows = [
    ...new Map(
      rows.map((row) => [
        `${row.establishment_id}|${row.period_start}|${row.period_type}`,
        row,
      ]),
    ).values(),
  ];

  const savedRows = await supabaseRequest(
    "historical_ca?on_conflict=establishment_id,period_start,period_type",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(uniqueRows),
    },
  );

  return {
    saved: true,
    historical: true,
    needs_review: false,
    year,
    report_period_type: reportPeriodType || null,
    report_total_ttc: reportTotalTtc || null,
    periods_saved: savedRows?.filter((row) => row.period_type !== "year").length || 0,
    document_path: documentPath,
  };
}

async function processIncomingEmail({ url, payload }) {
  let emailId = null;
  let attachmentId = null;
  let filename = null;
  let documentPath = null;
  let analysis = null;

  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY absente");
    }

    const eventData = payload.data || payload;
    emailId = eventData.email_id || eventData.id;

    if (!emailId) {
      throw new Error("Identifiant du courriel absent");
    }

    const email = await resendGet(
      `/emails/receiving/${encodeURIComponent(emailId)}`,
    );

    const recipients = [
      ...(Array.isArray(email.to) ? email.to : [email.to]),
      ...(Array.isArray(email.received_for)
        ? email.received_for
        : [email.received_for]),
      ...(Array.isArray(eventData.to) ? eventData.to : [eventData.to]),
    ]
      .filter(Boolean)
      .join(" ");

    if (
      /\bfactures?(?:-villa|-parc)?@reception\.oddos\.eu\b/i.test(recipients)
    ) {
      return processInvoiceEmail({
        email,
        eventData,
        emailId,
        origin: url.origin,
      });
    }

    const restaurantFromSubject = detectRestaurant(
      [email.subject, eventData.subject].filter(Boolean).join(" "),
    );
    const restaurant =
      restaurantFromSubject ||
      detectRestaurant(JSON.stringify({ payload: eventData, email }));

    let attachments = Array.isArray(email.attachments) ? email.attachments : [];

    if (!attachments.length && Array.isArray(eventData.attachments)) {
      attachments = eventData.attachments;
    }

    const attachment = attachments.find((item) => {
      const filename = clean(item.filename || item.name);

      const contentType = clean(
        item.content_type || item.contentType || item.type,
      );

      return contentType.includes("pdf") || filename.endsWith(".pdf");
    });

    if (!attachment) {
      return Response.json({
        ok: true,
        received: true,
        restaurant,
        needs_review: !restaurant,
        analyzed: false,
        saved: false,
        reason: "Aucun PDF trouvé",
      });
    }

    attachmentId = attachment.id;

    if (!attachmentId) {
      throw new Error("Identifiant de la pièce jointe absent");
    }

    const attachmentInfo = await resendGet(
      `/emails/receiving/${encodeURIComponent(
        emailId,
      )}/attachments/${encodeURIComponent(attachmentId)}`,
    );

    if (!attachmentInfo.download_url) {
      throw new Error("Lien de téléchargement du PDF absent");
    }

    const fileResponse = await fetch(attachmentInfo.download_url, {
      cache: "no-store",
    });

    if (!fileResponse.ok) {
      throw new Error(`Téléchargement PDF impossible : ${fileResponse.status}`);
    }

    const pdfBuffer = await fileResponse.arrayBuffer();

    filename = attachment.filename || attachment.name || "rapport-z.pdf";
    if (pdfBuffer.byteLength > 10 * 1024 * 1024) {
      throw new Error("PDF trop volumineux (10 Mo maximum)");
    }
    documentPath = await storeZDocument({
      emailId,
      attachmentId,
      filename,
      buffer: pdfBuffer,
    });
    await upsertZImport({
      emailId,
      attachmentId,
      filename,
      status: "processing",
      documentPath,
    });
    const historicalMarker = clean(
      [email.subject, eventData.subject, filename].filter(Boolean).join(" "),
    );
    const extractReportDates = (value) => [
      ...clean(value)
        .replace(/[^a-z0-9]+/g, " ")
        .matchAll(/\b(?:20)?(\d{2}) (\d{2}) (\d{2})\b/g),
    ].map((match) => `${match[1]}-${match[2]}-${match[3]}`);
    const filenameDates = extractReportDates(filename);
    const reportDates =
      filenameDates.length >= 2
        ? filenameDates
        : extractReportDates(historicalMarker);
    const hasDistinctDateRange =
      reportDates.length >= 2 && reportDates[0] !== reportDates.at(-1);
    const hasExplicitDateRange = reportDates.length >= 2;
    const hasHistoricalKeyword =
      /\b(historique|annuel|annuelle|general|generale|recap|recapitulatif|synthese|archive)\b/.test(
        historicalMarker,
      ) && /\b20\d{2}\b/.test(historicalMarker);
    const isHistorical = hasExplicitDateRange
      ? hasDistinctDateRange
      : hasHistoricalKeyword;

    console.log(
      JSON.stringify({
        level: "info",
        message: "Classification du Z",
        emailId,
        filename,
        reportDates,
        isHistorical,
      }),
    );

    let scanResponse = null;
    let scanText = "";
    let scanError = null;
    const retryableStatuses = new Set([429, 500, 502, 503, 504]);

    for (let attempt = 1; attempt <= 3; attempt++) {
      const formData = new FormData();

      formData.append(
        "file",
        new Blob([pdfBuffer], {
          type: "application/pdf",
        }),
        filename,
      );
      formData.append("type", isHistorical ? "z_history" : "z");

      try {
        scanResponse = await fetch(`${url.origin}/api/scan-ai`, {
          method: "POST",
          body: formData,
          cache: "no-store",
        });
        scanText = await scanResponse.text();
        scanError = null;

        if (scanResponse.ok || !retryableStatuses.has(scanResponse.status)) {
          break;
        }
      } catch (error) {
        scanError = error;
        scanResponse = null;
        scanText = "";
      }

      if (attempt < 3) {
        const delayMs = attempt === 1 ? 2000 : 5000;
        console.warn(
          JSON.stringify({
            level: "warning",
            message: "Nouvelle tentative d’analyse du Z",
            emailId,
            filename,
            attempt,
            status: scanResponse?.status || null,
            delayMs,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (!scanResponse?.ok) {
      const status = scanResponse?.status || 502;
      const details = scanText || String(scanError?.message || scanError || "");
      throw new Error(`Analyse IA ${status}: ${details}`);
    }

    try {
      analysis = JSON.parse(scanText);
    } catch {
      analysis = { raw: scanText };
    }

    const persistence = isHistorical
      ? await saveHistoricalZ({
          restaurant,
          filename,
          documentPath,
          emailId,
          analysis,
        })
      : await saveZReport({
          restaurant,
          filename,
          documentPath,
          analysis,
        });

    await upsertZImport({
      emailId,
      attachmentId,
      filename,
      status:
        persistence?.saved || persistence?.already_validated
          ? "saved"
          : "review",
      reason: persistence?.reason || null,
      analysis,
      dailySaleId: persistence?.daily_sale_id || null,
      documentPath,
    });

    console.log(
      JSON.stringify({
        level: "info",
        message: "Traitement du Z terminé",
        emailId,
        filename,
        historical: isHistorical,
        saved: persistence?.saved,
        needsReview: persistence?.needs_review,
      }),
    );

    return Response.json({
      ok: true,
      received: true,
      restaurant: restaurant || detectRestaurant(analysis?.result?.restaurant),
      analyzed: true,
      filename,
      analysis,
      ...persistence,
    });
  } catch (error) {
    console.error("z-webhook", error);

    try {
      await upsertZImport({
        emailId,
        attachmentId,
        filename,
        status: "error",
        reason: String(error?.message || error),
        analysis,
        documentPath,
      });
    } catch (journalError) {
      console.error("z-webhook journal", journalError);
    }

    return Response.json(
      {
        error: "Traitement automatique du courriel impossible",
        details: String(error?.message || error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const url = new URL(request.url);

  const suppliedSecret =
    request.headers.get("x-z-webhook-secret") || url.searchParams.get("secret");

  if (
    !process.env.Z_IMPORT_SECRET ||
    suppliedSecret !== process.env.Z_IMPORT_SECRET
  ) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  after(async () => {
    try {
      const result = await processIncomingEmail({ url, payload });

      if (!result.ok) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Traitement différé du courriel échoué",
            status: result.status,
            details: await result.text(),
          }),
        );
      }
    } catch (error) {
      console.error(
        "Erreur inattendue pendant le traitement différé du courriel",
        error,
      );
    }
  });

  return Response.json(
    {
      ok: true,
      received: true,
      queued: true,
    },
    { status: 202 },
  );
}
