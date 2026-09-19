export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const clean = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

const toNumber = (value) => {
  const number = Number(
    String(value ?? "")
      .replace(/\s/g, "")
      .replace(",", ".")
  )

  return Number.isFinite(number) ? number : 0
}

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100

function detectRestaurant(value) {
  const text = clean(value)

  if (text.includes("villa valleyre") || text.includes("valleyre")) {
    return {
      name: "Villa Valleyre",
      establishment_id: "8395bf22-99cb-4a7b-9096-ca734d583d83",
    }
  }

  if (text.includes("maison du parc") || text.includes("salles")) {
    return {
      name: "La Maison du Parc",
      establishment_id: "55c6e880-aa0c-40d6-9065-b5315b1a602a",
    }
  }

  return null
}

async function resendGet(path) {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    cache: "no-store",
  })

  const body = await response.json()

  if (!response.ok) {
    throw new Error(
      `Resend ${response.status}: ${JSON.stringify(body)}`
    )
  }

  return body
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = String(
    process.env.SUPABASE_URL || ""
  ).replace(/\/$/, "")

  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "SUPABASE_URL ou SUPABASE_SECRET_KEY absente"
    )
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: secretKey,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      cache: "no-store",
    }
  )

  const text = await response.text()

  let body = null

  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${
        typeof body === "string"
          ? body
          : JSON.stringify(body)
      }`
    )
  }

  return body
}

function calculateConfidence(result) {
  const confidence = result?.confidence || {}

  const values = [
    confidence.restaurant,
    confidence.date,
    confidence.ca,
  ]
    .map(Number)
    .filter(Number.isFinite)

  if (!values.length) return null

  return Math.max(
    0,
    Math.min(
      1,
      values.reduce((sum, value) => sum + value, 0) /
        values.length
    )
  )
}

async function saveZReport({
  restaurant,
  filename,
  analysis,
}) {
  const result = analysis?.result

  if (!result) {
    throw new Error("Résultat de l’analyse IA absent")
  }

  const resolvedRestaurant =
    restaurant || detectRestaurant(result.restaurant)

  if (!resolvedRestaurant) {
    return {
      saved: false,
      needs_review: true,
      reason: "Restaurant non identifié",
    }
  }

  const businessDate = String(result.date || "").trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return {
      saved: false,
      needs_review: true,
      reason: "Date du Z absente ou invalide",
    }
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
            line.vat_rate >= 0 &&
            line.amount_ht >= 0 &&
            line.amount_ttc > 0
        )
    : []

  if (!vatLines.length) {
    return {
      saved: false,
      needs_review: true,
      reason: "Ventilation TVA absente ou illisible",
    }
  }

  const totalHt = roundMoney(
    vatLines.reduce(
      (sum, line) => sum + line.amount_ht,
      0
    )
  )

  if (totalHt <= 0) {
    return {
      saved: false,
      needs_review: true,
      reason: "Total HT invalide",
    }
  }

  const lunch = toNumber(result.lunch)
  const dinner = toNumber(result.dinner)
  const splitTotal = lunch + dinner

  let lunchSalesHt = totalHt
  let dinnerSalesHt = 0

  if (lunch > 0 && dinner > 0 && splitTotal > 0) {
    lunchSalesHt = roundMoney(
      totalHt * (lunch / splitTotal)
    )
    dinnerSalesHt = roundMoney(totalHt - lunchSalesHt)
  }

  const covers = Math.max(
    0,
    Math.round(toNumber(result.covers))
  )

  const confidence = calculateConfidence(result)

  const establishmentFilter = encodeURIComponent(
    resolvedRestaurant.establishment_id
  )
  const dateFilter = encodeURIComponent(businessDate)

  const existingRows =
    (await supabaseRequest(
      `daily_sales?establishment_id=eq.${establishmentFilter}&business_date=eq.${dateFilter}&select=id,z_scan_status,z_document_path&limit=1`,
      {
        method: "GET",
      }
    )) || []

  const existing = existingRows[0] || null

  if (existing?.z_scan_status === "validated") {
    return {
      saved: false,
      needs_review: false,
      already_validated: true,
      daily_sale_id: existing.id,
      reason:
        "Ce Z a déjà été validé manuellement",
    }
  }

  const salePayload = {
    establishment_id:
      resolvedRestaurant.establishment_id,
    business_date: businessDate,
    lunch_sales_ht: lunchSalesHt,
    dinner_sales_ht: dinnerSalesHt,
    lunch_covers: covers,
    dinner_covers: 0,
    z_document_path: filename,
    z_scan_status: "analyzed",
    z_scan_confidence: confidence,
    updated_at: new Date().toISOString(),
  }

  let dailySale

  if (existing) {
    const updatedRows = await supabaseRequest(
      `daily_sales?id=eq.${encodeURIComponent(
        existing.id
      )}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(salePayload),
      }
    )

    dailySale = updatedRows?.[0]
  } else {
    const insertedRows = await supabaseRequest(
      "daily_sales",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(salePayload),
      }
    )

    dailySale = insertedRows?.[0]
  }

  if (!dailySale?.id) {
    throw new Error(
      "Supabase n’a pas retourné l’identifiant de la vente"
    )
  }

  await supabaseRequest(
    `daily_sale_vat_lines?daily_sale_id=eq.${encodeURIComponent(
      dailySale.id
    )}`,
    {
      method: "DELETE",
    }
  )

  await supabaseRequest("daily_sale_vat_lines", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(
      vatLines.map((line) => ({
        daily_sale_id: dailySale.id,
        ...line,
      }))
    ),
  })

  return {
    saved: true,
    needs_review: false,
    daily_sale_id: dailySale.id,
    business_date: businessDate,
    total_ht: totalHt,
    total_ttc: roundMoney(toNumber(result.ca)),
    covers,
    vat_lines_saved: vatLines.length,
  }
}

export async function POST(request) {
  const url = new URL(request.url)

  const suppliedSecret =
    request.headers.get("x-z-webhook-secret") ||
    url.searchParams.get("secret")

  if (
    !process.env.Z_IMPORT_SECRET ||
    suppliedSecret !== process.env.Z_IMPORT_SECRET
  ) {
    return Response.json(
      { error: "Non autorisé" },
      { status: 401 }
    )
  }

  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY absente")
    }

    const payload = await request.json()
    const eventData = payload.data || payload
    const emailId = eventData.email_id || eventData.id

    if (!emailId) {
      throw new Error("Identifiant du courriel absent")
    }

    const email = await resendGet(
      `/emails/receiving/${encodeURIComponent(emailId)}`
    )

    const restaurant = detectRestaurant(
      JSON.stringify({ payload: eventData, email })
    )

    let attachments = Array.isArray(email.attachments)
      ? email.attachments
      : []

    if (
      !attachments.length &&
      Array.isArray(eventData.attachments)
    ) {
      attachments = eventData.attachments
    }

    const attachment = attachments.find((item) => {
      const filename = clean(
        item.filename || item.name
      )

      const contentType = clean(
        item.content_type ||
          item.contentType ||
          item.type
      )

      return (
        contentType.includes("pdf") ||
        filename.endsWith(".pdf")
      )
    })

    if (!attachment) {
      return Response.json({
        ok: true,
        received: true,
        restaurant,
        needs_review: !restaurant,
        analyzed: false,
        saved: false,
        reason: "Aucun PDF trouvé",
      })
    }

    const attachmentId = attachment.id

    if (!attachmentId) {
      throw new Error(
        "Identifiant de la pièce jointe absent"
      )
    }

    const attachmentInfo = await resendGet(
      `/emails/receiving/${encodeURIComponent(
        emailId
      )}/attachments/${encodeURIComponent(attachmentId)}`
    )

    if (!attachmentInfo.download_url) {
      throw new Error(
        "Lien de téléchargement du PDF absent"
      )
    }

    const fileResponse = await fetch(
      attachmentInfo.download_url,
      {
        cache: "no-store",
      }
    )

    if (!fileResponse.ok) {
      throw new Error(
        `Téléchargement PDF impossible : ${fileResponse.status}`
      )
    }

    const pdfBuffer = await fileResponse.arrayBuffer()

    const filename =
      attachment.filename ||
      attachment.name ||
      "rapport-z.pdf"

    const formData = new FormData()

    formData.append(
      "file",
      new Blob([pdfBuffer], {
        type: "application/pdf",
      }),
      filename
    )

    formData.append("type", "z")

    const scanResponse = await fetch(
      `${url.origin}/api/scan-ai`,
      {
        method: "POST",
        body: formData,
        cache: "no-store",
      }
    )

    const scanText = await scanResponse.text()

    let analysis

    try {
      analysis = JSON.parse(scanText)
    } catch {
      analysis = { raw: scanText }
    }

    if (!scanResponse.ok) {
      throw new Error(
        `Analyse IA ${scanResponse.status}: ${scanText}`
      )
    }

    const persistence = await saveZReport({
      restaurant,
      filename,
      analysis,
    })

    return Response.json({
      ok: true,
      received: true,
      restaurant:
        restaurant ||
        detectRestaurant(
          analysis?.result?.restaurant
        ),
      analyzed: true,
      filename,
      analysis,
      ...persistence,
    })
  } catch (error) {
    console.error("z-webhook", error)

    return Response.json(
      {
        error:
          "Traitement automatique du Z impossible",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}
