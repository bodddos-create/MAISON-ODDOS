export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const clean = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

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

    if (!attachments.length && Array.isArray(eventData.attachments)) {
      attachments = eventData.attachments
    }

    const attachment = attachments.find((item) => {
      const filename = clean(item.filename || item.name)
      const contentType = clean(
        item.content_type || item.contentType || item.type
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
        reason: "Aucun PDF trouvé",
      })
    }

    const attachmentId = attachment.id

    if (!attachmentId) {
      throw new Error("Identifiant de la pièce jointe absent")
    }

    const attachmentInfo = await resendGet(
      `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`
    )

    if (!attachmentInfo.download_url) {
      throw new Error("Lien de téléchargement du PDF absent")
    }

    const fileResponse = await fetch(attachmentInfo.download_url, {
      cache: "no-store",
    })

    if (!fileResponse.ok) {
      throw new Error(
        `Téléchargement PDF impossible : ${fileResponse.status}`
      )
    }

    const pdfBuffer = await fileResponse.arrayBuffer()
    const filename =
      attachment.filename || attachment.name || "rapport-z.pdf"

    const formData = new FormData()
    formData.append(
      "file",
      new Blob([pdfBuffer], { type: "application/pdf" }),
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

    return Response.json({
      ok: true,
      received: true,
      restaurant,
      needs_review: !restaurant,
      analyzed: true,
      filename,
      analysis,
    })
  } catch (error) {
    return Response.json(
      {
        error: "Traitement automatique du Z impossible",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}
