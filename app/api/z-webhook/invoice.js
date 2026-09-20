const CATEGORIES = [
  "Alimentaire",
  "Boissons",
  "Consommable",
  "Entretien",
  "Mobilier",
  "Energie",
  "Assurance",
  "Telephonie",
  "TPE",
  "Logiciel caisse",
];

const RESTAURANTS = [
  {
    name: "Villa Valleyre",
    establishment_id: "8395bf22-99cb-4a7b-9096-ca734d583d83",
    markers: ["villa valleyre", "valleyre"],
  },
  {
    name: "La Maison du Parc",
    establishment_id: "55c6e880-aa0c-40d6-9065-b5315b1a602a",
    markers: ["maison du parc", "salles"],
  },
];

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

  return (
    RESTAURANTS.find((restaurant) =>
      restaurant.markers.some((marker) => text.includes(marker)),
    ) || null
  );
}

function confidence(result, key) {
  const value = Number(result?.confidence?.[key]);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function supportedAttachment(item) {
  const filename = clean(item?.filename || item?.name);
  const contentType = clean(
    item?.content_type || item?.contentType || item?.type,
  );

  return (
    contentType.includes("pdf") ||
    contentType.startsWith("image/") ||
    /\.(pdf|png|jpe?g|webp|heic)$/i.test(filename)
  );
}

function attachmentMediaType(attachment) {
  const contentType = String(
    attachment?.content_type ||
      attachment?.contentType ||
      attachment?.type ||
      "",
  ).toLowerCase();
  const filename = String(
    attachment?.filename || attachment?.name || "",
  ).toLowerCase();

  if (contentType.includes("pdf") || filename.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (contentType.startsWith("image/")) return contentType;
  if (/\.png$/i.test(filename)) return "image/png";
  if (/\.webp$/i.test(filename)) return "image/webp";
  if (/\.heic$/i.test(filename)) return "image/heic";
  return "image/jpeg";
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

async function storeDocument({
  emailId,
  attachmentId,
  filename,
  mediaType,
  buffer,
}) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SECRET_KEY absente");
  }

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const documentPath = `invoices/${month}/${safePathPart(emailId)}/${safePathPart(attachmentId)}-${safePathPart(filename)}`;
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
        "Content-Type": mediaType,
        "x-upsert": "true",
      },
      body: buffer,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Archivage du document impossible : ${response.status} ${details}`,
    );
  }

  return documentPath;
}

async function recordImport(data) {
  const rows = await supabaseRequest(
    "invoice_imports?on_conflict=email_id,attachment_id",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        ...data,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  return rows?.[0] || null;
}

async function findImport(emailId, attachmentId) {
  const params = new URLSearchParams({
    email_id: `eq.${emailId}`,
    attachment_id: `eq.${attachmentId}`,
    select: "id,status,invoice_id,reason,document_path",
    limit: "1",
  });
  const rows = await supabaseRequest(`invoice_imports?${params}`);
  return rows?.[0] || null;
}

async function analyzeAttachment({ emailId, attachment, origin }) {
  const attachmentId = attachment.id;

  if (!attachmentId) {
    throw new Error("Identifiant de la pièce jointe absent");
  }

  const info = await resendGet(
    `/emails/receiving/${encodeURIComponent(
      emailId,
    )}/attachments/${encodeURIComponent(attachmentId)}`,
  );

  if (!info.download_url) {
    throw new Error("Lien de téléchargement du document absent");
  }

  const fileResponse = await fetch(info.download_url, {
    cache: "no-store",
  });

  if (!fileResponse.ok) {
    throw new Error(
      `Téléchargement du document impossible : ${fileResponse.status}`,
    );
  }

  const buffer = await fileResponse.arrayBuffer();

  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("Document trop volumineux (10 Mo maximum)");
  }

  const filename =
    attachment.filename || attachment.name || "facture-fournisseur.pdf";
  const mediaType = attachmentMediaType(attachment);
  const documentPath = await storeDocument({
    emailId,
    attachmentId,
    filename,
    mediaType,
    buffer,
  });
  const formData = new FormData();

  formData.append("file", new Blob([buffer], { type: mediaType }), filename);
  formData.append("type", "invoice");

  const scanResponse = await fetch(`${origin}/api/scan-ai`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  const scanText = await scanResponse.text();
  let analysis;

  try {
    analysis = JSON.parse(scanText);
  } catch {
    analysis = { raw: scanText };
  }

  if (!scanResponse.ok) {
    const error = new Error(`Analyse IA ${scanResponse.status}: ${scanText}`);
    error.documentPath = documentPath;
    throw error;
  }

  return { analysis, attachmentId, filename, documentPath };
}

function invoiceReviewReason({ result, restaurant }) {
  const reasons = [];
  const invoiceDate = String(result?.date || "").trim();
  const supplier = String(result?.supplier || "").trim();
  const number = String(result?.number || "").trim();
  const category = String(result?.category || "").trim();
  const documentType = String(result?.documentType || "").trim();
  const ht = toNumber(result?.ht);
  const vat = toNumber(result?.vat);
  const ttc = toNumber(result?.ttc);
  const tolerance = Math.max(0.05, Math.abs(ttc) * 0.005);

  if (!restaurant) reasons.push("restaurant non identifié");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    reasons.push("date absente ou invalide");
  }
  if (!supplier) reasons.push("fournisseur absent");
  if (!number) reasons.push("numéro de document absent");
  if (!CATEGORIES.includes(category)) reasons.push("catégorie incertaine");
  if (!["invoice", "credit_note"].includes(documentType)) {
    reasons.push("type facture/avoir incertain");
  }
  if (ht <= 0 || ttc <= 0) reasons.push("total HT ou TTC invalide");
  if (Math.abs(ht + vat - ttc) > tolerance) {
    reasons.push("totaux HT, TVA et TTC incohérents");
  }

  const confidenceValues = [
    restaurant ? 1 : confidence(result, "restaurant"),
    confidence(result, "documentType"),
    confidence(result, "supplier"),
    confidence(result, "category"),
    confidence(result, "date"),
    confidence(result, "number"),
    confidence(result, "ht"),
    confidence(result, "ttc"),
  ];
  const average =
    confidenceValues.reduce((sum, value) => sum + value, 0) /
    confidenceValues.length;

  if (Math.min(...confidenceValues) < 0.72 || average < 0.82) {
    reasons.push("niveau de confiance insuffisant");
  }

  return {
    reason: reasons.join(" ; "),
    confidence: average,
  };
}

function normalizeVatLines(result) {
  const totalHt = toNumber(result?.ht);
  const totalVat = toNumber(result?.vat);
  const lines = Array.isArray(result?.vatLines)
    ? result.vatLines
        .map((line) => ({
          vat_rate: toNumber(line.vat_rate),
          amount_ht: roundMoney(toNumber(line.amount_ht)),
          vat_amount: roundMoney(toNumber(line.vat_amount)),
          amount_ttc: roundMoney(toNumber(line.amount_ttc)),
        }))
        .filter(
          (line) =>
            line.vat_rate >= 0 &&
            line.amount_ht >= 0 &&
            line.vat_amount >= 0 &&
            line.amount_ttc > 0,
        )
    : [];

  if (!lines.length) return [];

  const lineHt = roundMoney(
    lines.reduce((sum, line) => sum + line.amount_ht, 0),
  );
  const lineVat = roundMoney(
    lines.reduce((sum, line) => sum + line.vat_amount, 0),
  );

  return Math.abs(lineHt - totalHt) <= 0.1 &&
    Math.abs(lineVat - totalVat) <= 0.1
    ? lines
    : [];
}

async function findDuplicate({ result, restaurant }) {
  const base = {
    establishment_id: `eq.${restaurant.establishment_id}`,
    supplier: `eq.${String(result.supplier).trim()}`,
    document_type: `eq.${result.documentType}`,
    select: "id,invoice_number,scan_status,document_path",
    limit: "1",
  };
  const number = String(result.number || "").trim();

  if (number) {
    base.invoice_number = `eq.${number}`;
  } else {
    base.invoice_date = `eq.${result.date}`;
    base.amount_ht = `eq.${roundMoney(toNumber(result.ht))}`;
    base.vat_amount = `eq.${roundMoney(toNumber(result.vat))}`;
  }

  const rows = await supabaseRequest(
    `supplier_invoices?${new URLSearchParams(base)}`,
  );
  return rows?.[0] || null;
}

async function saveInvoice({
  email,
  emailId,
  attachmentId,
  filename,
  documentPath,
  analysis,
  restaurantFromEmail,
  previous,
}) {
  const result = analysis?.result;

  if (!result) throw new Error("Résultat de l’analyse IA absent");

  const restaurant = restaurantFromEmail || detectRestaurant(result.restaurant);
  const review = invoiceReviewReason({ result, restaurant });
  const importBase = {
    email_id: emailId,
    attachment_id: attachmentId,
    filename,
    recipient: Array.isArray(email.to)
      ? email.to.join(", ")
      : String(email.to || ""),
    sender: String(email.from || ""),
    subject: String(email.subject || ""),
    analysis,
    document_path: documentPath,
  };

  if (review.reason) {
    await recordImport({
      ...importBase,
      status: "review",
      reason: review.reason,
      invoice_id: null,
    });

    return {
      saved: false,
      needs_review: true,
      reason: review.reason,
      filename,
      analysis,
    };
  }

  const duplicate = await findDuplicate({ result, restaurant });

  if (duplicate) {
    if (documentPath && duplicate.document_path !== documentPath) {
      await supabaseRequest(
        `supplier_invoices?id=eq.${encodeURIComponent(duplicate.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ document_path: documentPath }),
        },
      );
    }

    const isStoredInvoice =
      previous?.status === "saved" && previous.invoice_id === duplicate.id;

    await recordImport({
      ...importBase,
      status: isStoredInvoice ? "saved" : "duplicate",
      reason: isStoredInvoice ? null : "Document déjà enregistré",
      invoice_id: duplicate.id,
    });

    return {
      saved: isStoredInvoice,
      duplicate: !isStoredInvoice,
      needs_review: false,
      invoice_id: duplicate.id,
      reason: isStoredInvoice ? null : "Document déjà enregistré",
      filename,
      document_path: documentPath,
    };
  }

  const payload = {
    establishment_id: restaurant.establishment_id,
    invoice_date: result.date,
    supplier: String(result.supplier).trim(),
    category: result.category,
    invoice_number: String(result.number).trim(),
    amount_ht: roundMoney(toNumber(result.ht)),
    vat_amount: roundMoney(toNumber(result.vat)),
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(result.dueDate)
      ? result.dueDate
      : null,
    paid: false,
    document_path: documentPath,
    scan_status: "analyzed",
    scan_confidence: review.confidence,
    document_type: result.documentType,
    source_email_id: emailId,
    source_attachment_id: attachmentId,
  };
  const inserted = await supabaseRequest("supplier_invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const invoice = inserted?.[0];

  if (!invoice?.id) {
    throw new Error("Supabase n’a pas retourné l’identifiant de la facture");
  }

  const vatLines = normalizeVatLines(result);

  if (vatLines.length) {
    try {
      await supabaseRequest("supplier_invoice_vat_lines", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(
          vatLines.map((line) => ({
            invoice_id: invoice.id,
            ...line,
          })),
        ),
      });
    } catch (error) {
      await supabaseRequest(
        `supplier_invoices?id=eq.${encodeURIComponent(invoice.id)}`,
        { method: "DELETE" },
      );
      throw error;
    }
  }

  await recordImport({
    ...importBase,
    status: "saved",
    reason: null,
    invoice_id: invoice.id,
  });

  return {
    saved: true,
    needs_review: false,
    invoice_id: invoice.id,
    document_type: result.documentType,
    restaurant,
    supplier: result.supplier,
    invoice_number: result.number,
    invoice_date: result.date,
    total_ht: payload.amount_ht,
    total_ttc: roundMoney(toNumber(result.ttc)),
    vat_lines_saved: vatLines.length,
    filename,
    document_path: documentPath,
  };
}

async function processAttachment(context) {
  const { email, emailId, attachment, origin, restaurantFromEmail } = context;
  const attachmentId = attachment.id;
  const filename =
    attachment.filename || attachment.name || "facture-fournisseur.pdf";

  if (!attachmentId) {
    return {
      saved: false,
      needs_review: true,
      filename,
      reason: "Identifiant de la pièce jointe absent",
    };
  }

  const previous = await findImport(emailId, attachmentId);

  if (
    previous?.document_path &&
    ["saved", "duplicate"].includes(previous.status)
  ) {
    return {
      saved: previous.status === "saved",
      duplicate: previous.status === "duplicate",
      already_processed: true,
      invoice_id: previous.invoice_id,
      reason: previous.reason,
      filename,
      document_path: previous.document_path,
    };
  }

  try {
    const analyzed = await analyzeAttachment({
      emailId,
      attachment,
      origin,
    });

    return await saveInvoice({
      email,
      emailId,
      ...analyzed,
      restaurantFromEmail,
      previous,
    });
  } catch (error) {
    await recordImport({
      email_id: emailId,
      attachment_id: attachmentId,
      filename,
      recipient: Array.isArray(email.to)
        ? email.to.join(", ")
        : String(email.to || ""),
      sender: String(email.from || ""),
      subject: String(email.subject || ""),
      status: "error",
      reason: String(error?.message || error).slice(0, 1500),
      analysis: null,
      document_path: error?.documentPath || previous?.document_path || null,
      invoice_id: null,
    });
    throw error;
  }
}

export async function processInvoiceEmail({
  email,
  eventData,
  emailId,
  origin,
}) {
  let attachments = Array.isArray(email.attachments) ? email.attachments : [];

  if (!attachments.length && Array.isArray(eventData.attachments)) {
    attachments = eventData.attachments;
  }

  const documents = attachments.filter(supportedAttachment).slice(0, 5);

  if (!documents.length) {
    return Response.json({
      ok: true,
      received: true,
      kind: "invoice",
      analyzed: false,
      saved: false,
      needs_review: true,
      reason: "Aucun PDF ou fichier image trouvé",
    });
  }

  const recipients = [
    ...(Array.isArray(email.to) ? email.to : [email.to]),
    ...(Array.isArray(email.received_for)
      ? email.received_for
      : [email.received_for]),
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedRecipients = clean(recipients);
  const restaurantFromRecipient = normalizedRecipients.includes(
    "factures-villa@reception.oddos.eu",
  )
    ? RESTAURANTS[0]
    : normalizedRecipients.includes("factures-parc@reception.oddos.eu")
      ? RESTAURANTS[1]
      : null;
  const restaurantFromEmail =
    restaurantFromRecipient ||
    detectRestaurant(
      JSON.stringify({
        subject: email.subject,
        text: email.text,
        html: email.html,
        from: email.from,
        to: email.to,
        received_for: email.received_for,
      }),
    );
  const results = await Promise.all(
    documents.map((attachment) =>
      processAttachment({
        email,
        emailId,
        attachment,
        origin,
        restaurantFromEmail,
      }),
    ),
  );

  return Response.json({
    ok: true,
    received: true,
    kind: "invoice",
    processed: results.length,
    ignored_attachments: Math.max(0, attachments.length - results.length),
    saved: results.filter((result) => result.saved).length,
    needs_review: results.filter((result) => result.needs_review).length,
    duplicates: results.filter((result) => result.duplicate).length,
    results,
  });
}
