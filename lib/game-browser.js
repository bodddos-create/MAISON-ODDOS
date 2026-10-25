import crypto from 'node:crypto';
export const browserCookie = 'lmp_game_browser';
export function browserIdentity(cookie, key) {
  const [id, signature] = String(cookie || '').split('.');
  if (/^[a-f0-9]{32}$/.test(id || '') && /^[a-f0-9]{64}$/.test(signature || '')) {
    const expected = crypto.createHmac('sha256', key).update(id).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      return { value: cookie, hash: crypto.createHmac('sha256', key).update('browser:' + id).digest('hex') };
  }
  const next = crypto.randomBytes(16).toString('hex');
  return { value: next + '.' + crypto.createHmac('sha256', key).update(next).digest('hex'), hash: crypto.createHmac('sha256', key).update('browser:' + next).digest('hex') };
}
