import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "openai/gpt-5.6-sol";
const FALLBACK_MODELS = ["openai/gpt-5.4"];
const GATEWAY_TIMEOUT_MS = 75_000;
const PDF_TEXT_TIMEOUT_MS = 10_000;
const MAX_PDF_PAGES = 40;
const MAX_EXTRACTED_TEXT_LENGTH = 100_000;

async function extractPdfText(buffer) {
  let pdf;

  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer), {
      maxImageSize: 16_777_216,
    });

    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF trop long (${pdf.numPages} pages)`);
    }

    const extraction = await Promise.race([
      extractText(pdf, { mergePages: true }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Délai d’extraction du texte PDF dépassé")),
          PDF_TEXT_TIMEOUT_MS,
        ),
      ),
    ]);
    const text = String(extraction?.text || "").trim();

    return text.length >= 40
      ? text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)
      : "";
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warning",
        message: "Extraction locale du texte PDF indisponible",
        error: String(error?.message || error),
      }),
    );
    return "";
  } finally {
    try {
      await pdf?.destroy?.();
    } catch {}
  }
}

const CATEGORIES = [
  "Alimentaire",
  "Boissons",
  "Consommable",
  "Entretien",
  "Carburant",
  "Mobilier",
  "Energie",
  "Assurance",
  "Telephonie",
  "TPE",
  "Logiciel caisse",
];

export async function POST(req) {
  try {
    const key = process.env.AI_GATEWAY_API_KEY;

    if (!key) {
      return NextResponse.json(
        { error: "AI Gateway non configuré." },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const requestedType = String(form.get("type") || "");
    const type = ["z", "z_history"].includes(requestedType)
      ? requestedType
      : "invoice";

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { error: "Document manquant." },
        { status: 400 },
      );
    }

    const mediaType = String(file.type || "").toLowerCase();
    const isImage = mediaType.startsWith("image/");
    const isPdf =
      mediaType === "application/pdf" ||
      String(file.name || "")
        .toLowerCase()
        .endsWith(".pdf");

    if (!isImage && !isPdf) {
      return NextResponse.json(
        { error: "Utilisez une image ou un fichier PDF." },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Document trop volumineux (10 Mo maximum)." },
        { status: 400 },
      );
    }

    const fileBuffer = await file.arrayBuffer();
    const b64 = Buffer.from(fileBuffer).toString("base64");
    const schema =
      type === "invoice"
        ? invoiceSchema
        : type === "z_history"
          ? zHistorySchema
          : zSchema;
    const instructions =
      type === "invoice"
        ? invoicePrompt
        : type === "z_history"
          ? zHistoryPrompt
          : zPrompt;

    const pdfText = isPdf ? await extractPdfText(fileBuffer) : "";

    if (isPdf) {
      console.log(
        JSON.stringify({
          level: "info",
          message: "Préparation du PDF pour analyse",
          filename: file.name || "document.pdf",
          extractedTextCharacters: pdfText.length,
          mode: pdfText ? "text" : "file",
        }),
      );
    }

    const documentInput = isPdf
      ? pdfText
        ? {
            type: "input_text",
            text: `Contenu texte extrait du PDF :\n\n${pdfText}`,
          }
        : {
            type: "input_file",
            filename: file.name || "document.pdf",
            file_data: `data:application/pdf;base64,${b64}`,
          }
      : {
          type: "input_image",
          image_url: `data:${mediaType};base64,${b64}`,
        };

    const body = {
      model: MODEL,
      providerOptions: {
        gateway: {
          models: FALLBACK_MODELS,
        },
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Tu analyses des documents comptables français pour Maison Oddos. Lis uniquement ce qui est visible. N’invente jamais une valeur, un taux ou une ventilation TVA absente ou ambiguë.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: instructions,
            },
            documentInput,
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name:
            type === "invoice"
              ? "supplier_invoice"
              : type === "z_history"
                ? "z_history_report"
                : "z_report",
          strict: true,
          schema,
        },
      },
    };

    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("AI Gateway", response.status, responseText);

      return NextResponse.json(
        {
          error: "La lecture IA est momentanément indisponible.",
          details: responseText.slice(0, 1000),
        },
        { status: 502 },
      );
    }

    const data = JSON.parse(responseText);

    const content =
      data.output_text ||
      data.output
        ?.flatMap((item) => item.content || [])
        ?.find((item) => item.type === "output_text")?.text;

    if (!content) {
      return NextResponse.json(
        { error: "L’IA n’a pas retourné de lecture exploitable." },
        { status: 502 },
      );
    }

    const parsed = typeof content === "string" ? JSON.parse(content) : content;

    return NextResponse.json({
      ok: true,
      result: normalize(parsed, type),
      model: data.model || MODEL,
    });
  } catch (error) {
    console.error("scan-ai", error);

    return NextResponse.json(
      {
        error: "Impossible d’analyser ce document.",
        details: String(error?.message || error),
      },
      { status: 500 },
    );
  }
}

const confidence = {
  type: "number",
  minimum: 0,
  maximum: 1,
};

const field = (valueType = "string") => ({
  type: "object",
  additionalProperties: false,
  required: ["value", "confidence"],
  properties: {
    value: { type: [valueType, "null"] },
    confidence,
  },
});

const vatLine = {
  type: "object",
  additionalProperties: false,
  required: ["rate", "ht", "vat", "ttc", "confidence"],
  properties: {
    rate: { type: ["number", "null"] },
    ht: { type: ["number", "null"] },
    vat: { type: ["number", "null"] },
    ttc: { type: ["number", "null"] },
    confidence,
  },
};

const invoiceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "restaurant",
    "documentType",
    "supplier",
    "category",
    "date",
    "number",
    "ht",
    "vat",
    "ttc",
    "dueDate",
    "vatLines",
  ],
  properties: {
    restaurant: field(),
    documentType: field(),
    supplier: field(),
    category: field(),
    date: field(),
    number: field(),
    ht: field("number"),
    vat: field("number"),
    ttc: field("number"),
    dueDate: field(),
    vatLines: {
      type: "array",
      items: vatLine,
    },
  },
};

const zSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "restaurant",
    "date",
    "ca",
    "covers",
    "lunch",
    "dinner",
    "vatLines",
  ],
  properties: {
    restaurant: field(),
    date: field(),
    ca: field("number"),
    covers: field("number"),
    lunch: field("number"),
    dinner: field("number"),
    vatLines: {
      type: "array",
      items: vatLine,
    },
  },
};

const historyPeriod = {
  type: "object",
  additionalProperties: false,
  required: ["granularity", "date", "ttc", "covers", "confidence"],
  properties: {
    granularity: { type: "string", enum: ["day", "month"] },
    date: { type: "string" },
    ttc: { type: ["number", "null"] },
    covers: { type: ["number", "null"] },
    confidence,
  },
};

const zHistorySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "restaurant",
    "year",
    "periodStart",
    "periodEnd",
    "reportTotalTtc",
    "reportCovers",
    "periods",
  ],
  properties: {
    restaurant: field(),
    year: field("number"),
    periodStart: field(),
    periodEnd: field(),
    reportTotalTtc: field("number"),
    reportCovers: field("number"),
    periods: { type: "array", items: historyPeriod },
  },
};

const invoicePrompt = `Lis ce document fournisseur. Retourne uniquement le JSON demandé. documentType vaut exactement "invoice" pour une facture ou "credit_note" pour un avoir, uniquement d'après une mention explicite du document. restaurant vaut exactement "Villa Valleyre" ou "La Maison du Parc" seulement si identifiable. category doit être l'une de: ${CATEGORIES.join(", ")}. date et dueDate au format YYYY-MM-DD. ht, vat et ttc sont les totaux en valeur positive, y compris pour un avoir. vatLines contient chaque ventilation TVA explicitement visible avec rate=taux %, ht=base HT, vat=montant TVA et ttc=HT+TVA, toujours en valeur positive. N'ajoute aucune ligne si la ventilation n'est pas lisible et n'invente jamais un taux à partir du seul total. Vérifie HT + TVA ≈ TTC.`;

const zPrompt = `Lis ce Z de caisse. Retourne uniquement le JSON demandé. restaurant vaut exactement "Villa Valleyre" ou "La Maison du Parc" seulement si identifiable. date vient uniquement du Z. ca = CA/total TTC de clôture. covers seulement s'il est indiqué. lunch et dinner seulement s'ils sont explicitement présents. vatLines contient chaque ventilation TVA explicitement imprimée sur le Z avec taux, base HT, TVA et TTC. N'invente aucune ventilation ni répartition midi/soir.`;

const zHistoryPrompt = `Lis ce récapitulatif historique de caisse. Retourne uniquement le JSON demandé. restaurant vaut exactement "Villa Valleyre" ou "La Maison du Parc" seulement si identifiable. year est l'année couverte. periodStart et periodEnd sont les dates de début et de fin du rapport au format YYYY-MM-DD. reportTotalTtc est le CA/total TTC global explicitement imprimé pour toute la période du rapport, qu'il couvre un jour, un mois ou une année. reportCovers est le nombre total de couverts explicitement imprimé pour toute la période du rapport. periods contient chaque autre total TTC explicitement imprimé par jour ou par mois : granularity vaut "day" avec date YYYY-MM-DD, ou "month" avec date YYYY-MM-01. covers est le nombre de couverts de la même période uniquement s'il est indiqué. Ne calcule pas une période en additionnant des lignes, ne transforme pas un cumul en période et n'invente aucune valeur.`;

function val(x) {
  return x && x.value != null ? String(x.value) : "";
}

function num(x) {
  return x && typeof x.value === "number" && Number.isFinite(x.value)
    ? String(Math.round(x.value * 100) / 100)
    : "";
}

function conf(x) {
  return x && Number.isFinite(x.confidence)
    ? Math.max(0, Math.min(1, x.confidence))
    : 0;
}

function lines(a) {
  return Array.isArray(a)
    ? a
        .filter(
          (x) =>
            x &&
            Number.isFinite(x.rate) &&
            Number.isFinite(x.ht) &&
            Number.isFinite(x.vat),
        )
        .map((x) => ({
          vat_rate: String(x.rate),
          amount_ht: String(Math.round(x.ht * 100) / 100),
          vat_amount: String(Math.round(x.vat * 100) / 100),
          amount_ttc: Number.isFinite(x.ttc)
            ? String(Math.round(x.ttc * 100) / 100)
            : String(Math.round((x.ht + x.vat) * 100) / 100),
          confidence: conf(x),
        }))
    : [];
}

function normalize(p, type) {
  if (type === "z_history") {
    const year = Number(p?.year?.value);
    return {
      restaurant: val(p.restaurant),
      year: Number.isInteger(year) ? String(year) : "",
      periodStart: val(p.periodStart),
      periodEnd: val(p.periodEnd),
      reportTotalTtc: num(p.reportTotalTtc),
      reportCovers: num(p.reportCovers),
      periods: Array.isArray(p.periods)
        ? p.periods
            .filter(
              (item) =>
                item &&
                ["day", "month"].includes(item.granularity) &&
                typeof item.date === "string" &&
                Number.isFinite(item.ttc),
            )
            .map((item) => ({
              granularity: item.granularity,
              date: item.date,
              ttc: String(Math.round(item.ttc * 100) / 100),
              covers: Number.isFinite(item.covers)
                ? String(Math.max(0, Math.round(item.covers)))
                : "",
              confidence: conf(item),
            }))
        : [],
      confidence: {
        restaurant: conf(p.restaurant),
        year: conf(p.year),
        periodStart: conf(p.periodStart),
        periodEnd: conf(p.periodEnd),
        reportTotalTtc: conf(p.reportTotalTtc),
        reportCovers: conf(p.reportCovers),
      },
    };
  }

  if (type === "z") {
    return {
      restaurant: val(p.restaurant),
      date: val(p.date),
      ca: num(p.ca),
      covers: num(p.covers),
      lunch: num(p.lunch),
      dinner: num(p.dinner),
      vatLines: lines(p.vatLines),
      confidence: {
        restaurant: conf(p.restaurant),
        date: conf(p.date),
        ca: conf(p.ca),
        covers: conf(p.covers),
        lunch: conf(p.lunch),
        dinner: conf(p.dinner),
      },
    };
  }

  const category = CATEGORIES.includes(val(p.category)) ? val(p.category) : "";
  const documentType = ["invoice", "credit_note"].includes(val(p.documentType))
    ? val(p.documentType)
    : "";

  return {
    restaurant: val(p.restaurant),
    documentType,
    supplier: val(p.supplier),
    category,
    date: val(p.date),
    number: val(p.number),
    ht: num(p.ht),
    vat: num(p.vat),
    ttc: num(p.ttc),
    dueDate: val(p.dueDate),
    vatLines: lines(p.vatLines),
    confidence: {
      restaurant: conf(p.restaurant),
      documentType: documentType ? conf(p.documentType) : 0,
      supplier: conf(p.supplier),
      category: category ? conf(p.category) : 0,
      date: conf(p.date),
      number: conf(p.number),
      ht: conf(p.ht),
      vat: conf(p.vat),
      ttc: conf(p.ttc),
      dueDate: conf(p.dueDate),
    },
  };
}
