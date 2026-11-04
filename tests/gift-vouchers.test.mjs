import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../app/api/roue/gestion/route.js', import.meta.url), 'utf8'))
 .replace('"next/server"', JSON.stringify(new URL('../node_modules/next/server.js', import.meta.url).href))
 .replace('"../../../../lib/roue-server"', JSON.stringify(new URL('../lib/roue-server.js', import.meta.url).href))
 .replace('"../../../../lib/roue-config"', JSON.stringify(new URL('../lib/roue-config.js', import.meta.url).href));
const { GET, PATCH } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const id = '00000000-0000-0000-0000-000000000001';
const req = (body, token = true) => new Request('https://app.test/api/roue/gestion', {
 method: 'PATCH', headers: { origin: 'https://app.test', ...(token ? { authorization: 'Bearer fixture' } : {}) }, body: JSON.stringify(body),
});
test('Gift management requires authorized staff and redemption stays single-use', async () => {
 const original = globalThis.fetch;
 process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SECRET_KEY = 'fixture';
 let redeemed = false, queries = [];
 try {
  globalThis.fetch = async (url, opts) => {
   if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'staff-fixture' });
   if (url.includes('/profiles?')) return Response.json([{ role: 'direction' }]);
   queries.push(url);
   assert.match(url, /gift_vouchers\?establishment_id=eq\.55c6e880/);
   assert.match(url, /used_at=is.null&expires_at=gt\./);
   assert.equal(opts.method, 'PATCH');
   assert.equal(JSON.parse(opts.body).used_by, 'staff-fixture');
   const result = redeemed ? [] : [{ id }]; redeemed = true;
   return Response.json(result);
  };
  assert.equal((await GET(new Request('https://app.test/api/roue/gestion'))).status, 403);
  assert.equal((await PATCH(req({ id, kind: 'gift', action: 'redeem' }, false))).status, 403);
  assert.equal((await PATCH(req({ id, kind: 'gift', action: 'resend' }))).status, 400);
  assert.equal(queries.length, 0);
  assert.deepEqual(await (await PATCH(req({ id, kind: 'gift', action: 'redeem' }))).json(), { updated: true });
  assert.deepEqual(await (await PATCH(req({ id, kind: 'gift', action: 'redeem' }))).json(), { updated: false });
 } finally { globalThis.fetch = original; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; }
});
