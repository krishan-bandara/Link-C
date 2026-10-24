// Regression checks for the bugs found by QA round 1. Run: node --env-file=.env scripts/qa/regress.mjs
import sharp from 'sharp';
import { execSync } from 'node:child_process';
import { admin, BASE, cookieHeader, session, OWNER_EMAIL, MEMBER_EMAIL } from './helpers.mjs';

const db = admin();
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`);
};

const ownerS = await session(OWNER_EMAIL);
const memberS = await session(MEMBER_EMAIL);
const ownerC = cookieHeader(ownerS);
const memberC = cookieHeader(memberS);
const { data: conv } = await db.from('conversations').select('id').limit(1).single();
const created = [];

async function api(cookie, method, path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { cookie, ...(body && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? (body instanceof Uint8Array ? body : JSON.stringify(body)) : undefined,
  });
  return r;
}

async function upload(cookie, buf, mime, mode = 'normal', timerSeconds = null) {
  const r = await api(cookie, 'POST', '/api/uploads', { conversationId: conv.id, mime, size: buf.length, mode, timerSeconds });
  if (!r.ok) return { error: `init ${r.status}` };
  const { uploadId, chunkSize, totalChunks } = await r.json();
  for (let i = 0; i < totalChunks; i++) {
    const part = buf.subarray(i * chunkSize, Math.min(buf.length, (i + 1) * chunkSize));
    const pr = await fetch(`${BASE}/api/uploads/${uploadId}/chunk?i=${i}`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/octet-stream', 'content-length': String(part.length) },
      body: part,
    });
    if (!pr.ok) return { error: `chunk ${pr.status}` };
  }
  const cr = await api(cookie, 'POST', `/api/uploads/${uploadId}/complete`);
  if (cr.status !== 202) return { error: `complete ${cr.status}` };
  for (let t = 0; t < 120; t++) {
    await new Promise((r) => setTimeout(r, 500));
    const g = await (await api(cookie, 'GET', `/api/uploads/${uploadId}`)).json();
    if (g.status === 'done') {
      created.push(g.messageId);
      return { id: uploadId, messageId: g.messageId };
    }
    if (g.status === 'failed') return { error: g.error || 'failed' };
  }
  return { error: 'timeout' };
}

const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 120, b: 200 } } })
  .jpeg()
  .toBuffer();

// 1. uploads to B2 must now be reliable
let ok = 0;
const times = [];
let lastId;
for (let i = 0; i < 8; i++) {
  const t0 = Date.now();
  const r = await upload(ownerC, jpeg, 'image/jpeg');
  times.push(Date.now() - t0);
  if (r.id) {
    ok++;
    lastId = r.id;
  } else console.log('   upload', i, 'failed:', r.error);
}
check('8 sequential normal-image uploads to B2 all succeed', ok === 8, `${ok}/8, ms: ${times.join(',')}`);

// 2. stream speed: cold (cache cleared) vs warm
if (lastId) {
  try {
    execSync('docker compose exec -T app sh -c "rm -rf /data/cache/*"', { stdio: 'ignore' });
  } catch {}
  const t1 = Date.now();
  const a = await api(memberC, 'GET', `/api/media/${lastId}/stream`);
  const ab = Buffer.from(await a.arrayBuffer());
  const cold = Date.now() - t1;
  const t2 = Date.now();
  const b = await api(memberC, 'GET', `/api/media/${lastId}/stream`);
  await b.arrayBuffer();
  const warm = Date.now() - t2;
  check('stream after cache clear returns the image', a.status === 200 && ab.length > 1000 && ab[0] === 0xff, `cold ${cold} ms, warm ${warm} ms`);
  check('warm (cached) stream is not slower than cold', warm <= cold + 50);
}

// 3. 20 parallel image loads (the earlier timeout scenario)
if (lastId) {
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: 20 }, () => api(memberC, 'GET', `/api/media/${lastId}/stream`).then((r) => r.arrayBuffer().then((x) => [r.status, x.byteLength]))));
  check('20 parallel loads of one image all succeed', rs.every(([s, n]) => s === 200 && n > 1000), `${Date.now() - t0} ms`);
}

// 4. GIF metadata stripped
const gif = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } } }).gif().toBuffer();
const secret = Buffer.from('SECRETCOMMENT');
const gifWithComment = Buffer.concat([gif.subarray(0, gif.length - 1), Buffer.from([0x21, 0xfe, secret.length]), secret, Buffer.from([0x00, 0x3b])]);
const g = await upload(ownerC, gifWithComment, 'image/gif');
if (g.id) {
  const r = await api(memberC, 'GET', `/api/media/${g.id}/stream`);
  const bytes = Buffer.from(await r.arrayBuffer());
  check('GIF comment block is stripped', r.status === 200 && !bytes.includes(secret), `served ${bytes.length} bytes`);
} else check('GIF upload works', false, g.error);

// 5. corrupt image gives a clear message
const bad = await upload(ownerC, jpeg.subarray(0, 300), 'image/jpeg');
check('truncated JPEG rejected with a clear message', bad.error === 'This image could not be read', String(bad.error));

// 6. view-once image burns even when fetched with a Range header
const snap = await upload(ownerC, jpeg, 'image/jpeg', 'once');
if (snap.id) {
  const o = await api(memberC, 'POST', `/api/media/${snap.id}/open`);
  const { token } = await o.json();
  const s1 = await api(memberC, 'GET', `/api/media/${snap.id}/stream?t=${token}`, null, { range: 'bytes=0-' });
  await s1.arrayBuffer();
  const s2 = await api(memberC, 'GET', `/api/media/${snap.id}/stream?t=${token}`, null, { range: 'bytes=0-' });
  check('first Range fetch of a view-once image works, second is gone', s1.status === 206 && s2.status === 410, `${s1.status} then ${s2.status}`);
} else check('snap upload works', false, snap.error);

// 7. malformed JSON -> 400, not 500
const m1 = await fetch(BASE + '/api/uploads', { method: 'POST', headers: { cookie: ownerC, 'content-type': 'application/json' }, body: '{bad' });
const m2 = await fetch(BASE + '/api/uploads', { method: 'POST', headers: { cookie: ownerC, 'content-type': 'application/json' } });
check('malformed / empty JSON returns 400', m1.status === 400 && m2.status === 400, `${m1.status}, ${m2.status}`);

// 8. screenshot report is idempotent
const snap2 = await upload(ownerC, jpeg, 'image/jpeg', 'once');
if (snap2.id) {
  await api(memberC, 'POST', `/api/media/${snap2.id}/open`);
  const before = (await db.from('messages').select('id', { count: 'exact', head: true }).eq('type', 'system').eq('conversation_id', conv.id)).count;
  await api(memberC, 'POST', `/api/media/${snap2.id}/screenshot`);
  await api(memberC, 'POST', `/api/media/${snap2.id}/screenshot`);
  const after = (await db.from('messages').select('id', { count: 'exact', head: true }).eq('type', 'system').eq('conversation_id', conv.id)).count;
  check('two screenshot reports create one system message', after - before === 1, `+${after - before}`);
}

// cleanup everything created here
for (const id of created.filter(Boolean)) await api(ownerC, 'DELETE', `/api/messages/${id}`);
const { data: left } = await db.from('media_items').select('id').in('message_id', created.filter(Boolean));
check('cleanup removed all test media', (left ?? []).length === 0, `${(left ?? []).length} left`);
await db.from('messages').delete().eq('type', 'system').eq('conversation_id', conv.id).ilike('body', 'Screenshot%');

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
