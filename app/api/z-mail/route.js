import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const secret = process.env.Z_IMPORT_SECRET
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (!process.env.Z_MAIL_USER || !process.env.Z_MAIL_PASSWORD || !process.env.Z_MAIL_HOST) {
    return Response.json({ error: 'Configuration Z incomplète' }, { status: 503 })
  }
  const client = new ImapFlow({
    host: process.env.Z_MAIL_HOST,
    port: 993,
    secure: true,
    auth: { user: process.env.Z_MAIL_USER, pass: process.env.Z_MAIL_PASSWORD },
    logger: false
  })
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const uids = await client.search({ seen: false }, { uid: true })
      const messages = []
      for (const uid of uids.slice(-10)) {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true })
        const parsed = await simpleParser(msg.source)
        messages.push({
          uid,
          subject: parsed.subject || '',
          from: parsed.from?.text || '',
          date: parsed.date || null,
          attachments: (parsed.attachments || []).map(a => ({
            filename: a.filename || '',
            contentType: a.contentType || '',
            size: a.size || a.content?.length || 0
          }))
        })
      }
      return Response.json({ ok: true, count: messages.length, messages })
    } finally { lock.release() }
  } catch (e) {
    return Response.json({ error: 'Connexion à la boîte Z impossible', details: String(e?.message || e) }, { status: 502 })
  } finally {
    try { await client.logout() } catch {}
  }
}
