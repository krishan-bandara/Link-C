// Seeds animated official sticker packs from Google Noto Emoji Animation (CC BY 4.0, https://googlefonts.github.io/noto-emoji-animation/).
// Run from the repo root:  node --env-file=.env scripts/seed-animated-emoji.mjs
// Needs the app running at http://localhost:3005. Idempotent: skips stickers that already exist (same pack + emoji).
// The server keeps the animation, shrinks it to 256 px and stores it encrypted like every other sticker (see normalise in src/lib/assets.ts).
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { admin, cookieHeader, session, BASE } from '../qa/helpers.mjs';

const CACHE = path.resolve('qa/noto-anim-cache');
const URL_BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

const PACKS = {
  'Animated Smileys': ['😀', '😂', '🤣', '😍', '😉', '😎', '🤔', '😭', '😠', '😴', '🥳', '🤩', '🙄', '😘', '😱', '🤗', '🥺', '😇', '🤪', '🥰'],
  'Animated Gestures': ['👍', '👏', '👋', '🙏', '💪', '👌', '✌️', '🤝', '🙌', '🤞', '🤙', '👎', '✊', '🫶', '🤟', '🤘'],
  'Animated Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💖', '💗', '💓', '💕', '💞', '💘', '💝', '❤️‍🔥'],
  'Animated Animals': ['🐕', '🐱', '🐒', '🦁', '🐼', '🦄', '🦊', '🐸', '🐖', '🐅', '🐇', '🐻', '🐧', '🦉', '🦋', '🐢', '🦀', '🐙'],
  'Animated Fun': ['🔥', '✨', '⭐', '🚀', '🎁', '💯', '🎈', '🎶', '🏆', '🎉', '💡', '👑', '🌈', '💥', '🎸', '☕'],
};

/** Noto file names are lowercase hex code points joined by "_"; fe0f is present for some emoji and not others, so try both. */
function candidates(emoji) {
  const cps = [...emoji].map((c) => c.codePointAt(0).toString(16));
  const without = cps.filter((c) => c !== 'fe0f');
  return [...new Set([cps.join('_'), without.join('_')])];
}

async function download(emoji) {
  for (const code of candidates(emoji)) {
    const file = path.join(CACHE, `${code}.webp`);
    if (!(await exists(file))) {
      const r = await fetch(`${URL_BASE}${code}/512.webp`);
      if (!r.ok) continue;
      await writeFile(file, Buffer.from(await r.arrayBuffer()));
      await sleep(150);
    }
    const buf = await readFile(file);
    const webp = buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    if (!webp) throw new Error('not a WebP');
    if (buf.length >= 4 * 1024 * 1024) throw new Error('over 4 MB');
    return buf;
  }
  throw new Error('no animation found');
}

await mkdir(CACHE, { recursive: true });
const db = admin();

// the REAL owner: an owner profile whose auth email is not a throwaway test account
const { data: owners } = await db.from('profiles').select('id').eq('role', 'owner');
let owner = null;
let email = null;
for (const o of owners ?? []) {
  const u = await db.auth.admin.getUserById(o.id);
  const e = u.data?.user?.email;
  if (e && !e.endsWith('@test.invalid')) { owner = o; email = e; break; }
}
if (!owner || !email) throw new Error('no real owner profile found');
let sess = await session(email);

const stats = { downloaded_failed: 0, added: 0, skipped: 0, upload_failed: 0, packs_created: 0 };
const failures = [];

for (const [packName, items] of Object.entries(PACKS)) {
  let { data: pack } = await db.from('sticker_packs').select('id').eq('name', packName).eq('created_by', owner.id).limit(1).maybeSingle();
  if (!pack) {
    const ins = await db.from('sticker_packs').insert({ name: packName, created_by: owner.id }).select('id').single();
    if (ins.error) throw new Error(`pack insert failed: ${packName}`);
    pack = ins.data;
    stats.packs_created++;
  }
  const { data: have } = await db.from('stickers').select('emoji').eq('pack_id', pack.id);
  const haveSet = new Set((have ?? []).map((s) => s.emoji));

  for (const emoji of items) {
    if (haveSet.has(emoji)) { stats.skipped++; continue; }
    try {
      const img = await download(emoji);
      let r;
      for (let attempt = 0; attempt < 3; attempt++) {
        r = await fetch(`${BASE}/api/admin/stickers?packId=${pack.id}&emoji=${encodeURIComponent(emoji)}`, {
          method: 'POST',
          headers: { Cookie: cookieHeader(sess), 'Content-Type': 'image/webp' },
          body: img,
          signal: AbortSignal.timeout(60000),
        });
        if (r.status === 401) sess = await session(email); // token expired: sign in again and retry
        else if (r.status < 500) break;
        await sleep(2000);
      }
      if (!r.ok) throw new Error(`upload HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
      stats.added++;
    } catch (e) {
      const m = String(e.message);
      if (m.startsWith('upload')) stats.upload_failed++; else stats.downloaded_failed++;
      failures.push(`${packName}/${emoji}: ${m}`);
    }
  }
}

console.log(JSON.stringify(stats));
if (failures.length) console.log('failures:\n' + failures.join('\n'));
