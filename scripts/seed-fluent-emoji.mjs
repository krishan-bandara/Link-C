// Seeds the official sticker packs from Microsoft Fluent Emoji (MIT, https://github.com/microsoft/fluentui-emoji).
// Run from the repo root:  node --env-file=.env scripts/seed-fluent-emoji.mjs
// Needs the app running at http://localhost:3005. Idempotent: skips stickers that already exist (same pack + emoji).
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { admin, cookieHeader, session, BASE } from './qa/helpers.mjs';

const CACHE = path.resolve('.cache/fluent');
const RAW = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

// [Fluent folder name, emoji character]
const PACKS = {
  Smileys: [
    ['Grinning face', '😀'], ['Face with tears of joy', '😂'], ['Smiling face with heart-eyes', '😍'], ['Winking face', '😉'],
    ['Smiling face with sunglasses', '😎'], ['Thinking face', '🤔'], ['Loudly crying face', '😭'], ['Angry face', '😠'],
    ['Sleeping face', '😴'], ['Partying face', '🥳'], ['Star-struck', '🤩'], ['Face with rolling eyes', '🙄'],
    ['Face blowing a kiss', '😘'], ['Face screaming in fear', '😱'], ['Hugging face', '🤗'], ['Pleading face', '🥺'],
  ],
  Gestures: [
    ['Thumbs up', '👍'], ['Clapping hands', '👏'], ['Waving hand', '👋'], ['Folded hands', '🙏'],
    ['Flexed biceps', '💪'], ['Ok hand', '👌'], ['Victory hand', '✌️'], ['Handshake', '🤝'],
    ['Raised hand', '✋'], ['Raising hands', '🙌'], ['Crossed fingers', '🤞'], ['Call me hand', '🤙'],
    ['Index pointing up', '☝️'], ['Thumbs down', '👎'], ['Raised fist', '✊'], ['Writing hand', '✍️'],
  ],
  'Hearts & Love': [
    ['Red heart', '❤️'], ['Orange heart', '🧡'], ['Yellow heart', '💛'], ['Green heart', '💚'],
    ['Blue heart', '💙'], ['Purple heart', '💜'], ['Black heart', '🖤'], ['Broken heart', '💔'],
    ['Sparkling heart', '💖'], ['Growing heart', '💗'], ['Beating heart', '💓'], ['Two hearts', '💕'],
    ['Revolving hearts', '💞'], ['Heart with arrow', '💘'], ['Heart with ribbon', '💝'], ['Love letter', '💌'],
  ],
  Animals: [
    ['Dog face', '🐶'], ['Cat face', '🐱'], ['Monkey face', '🐵'], ['Lion', '🦁'],
    ['Panda', '🐼'], ['Unicorn', '🦄'], ['Fox', '🦊'], ['Frog', '🐸'],
    ['Pig face', '🐷'], ['Tiger face', '🐯'], ['Koala', '🐨'], ['Rabbit face', '🐰'],
    ['Bear', '🐻'], ['Penguin', '🐧'], ['Owl', '🦉'], ['Butterfly', '🦋'],
  ],
  'Food & Drinks': [
    ['Pizza', '🍕'], ['Hamburger', '🍔'], ['French fries', '🍟'], ['Hot dog', '🌭'],
    ['Taco', '🌮'], ['Sushi', '🍣'], ['Birthday cake', '🎂'], ['Doughnut', '🍩'],
    ['Ice cream', '🍨'], ['Cookie', '🍪'], ['Popcorn', '🍿'], ['Hot beverage', '☕'],
    ['Beer mug', '🍺'], ['Wine glass', '🍷'], ['Strawberry', '🍓'], ['Watermelon', '🍉'],
  ],
  'Fun & Objects': [
    ['Fire', '🔥'], ['Sparkles', '✨'], ['Star', '⭐'], ['Rocket', '🚀'],
    ['Wrapped gift', '🎁'], ['Hundred points', '💯'], ['Check mark button', '✅'], ['Balloon', '🎈'],
    ['Musical note', '🎵'], ['Trophy', '🏆'], ['Party popper', '🎉'], ['Light bulb', '💡'],
    ['Crown', '👑'], ['Rainbow', '🌈'], ['Collision', '💥'], ['Video game', '🎮'],
  ],
};

async function getTree() {
  const f = path.join(CACHE, 'tree.json');
  if (!(await exists(f))) {
    const r = await fetch('https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1', {
      headers: { 'User-Agent': 'link-c-seed' },
    });
    if (!r.ok) throw new Error(`tree fetch failed ${r.status}`);
    await writeFile(f, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(await readFile(f, 'utf8')).tree.map((x) => x.path);
}

/** Default (no skin tone) 3D png for a folder: assets/<Name>/3D/*.png, else assets/<Name>/Default/3D/*.png */
function pngPath(paths, name) {
  const base = `assets/${name}/`;
  const pngs = paths.filter((p) => p.startsWith(base) && p.endsWith('.png') && /\/3D\//.test(p));
  return pngs.find((p) => p.startsWith(`${base}3D/`)) ?? pngs.find((p) => p.startsWith(`${base}Default/3D/`));
}

async function download(rel) {
  const file = path.join(CACHE, rel.replace(/[\\/]/g, '__'));
  if (!(await exists(file))) {
    const r = await fetch(RAW + rel.split('/').map(encodeURIComponent).join('/'));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
    await sleep(150);
  }
  const buf = await readFile(file);
  const png = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!png) throw new Error('not a PNG');
  if (buf.length >= 1024 * 1024) throw new Error('over 1 MB');
  return buf;
}

await mkdir(CACHE, { recursive: true });
const paths = await getTree();
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
if (!owner) throw new Error('no real owner profile found');
if (!email) throw new Error('owner email not found');
const sess = await session(email);

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

  for (const [name, emoji] of items) {
    if (haveSet.has(emoji)) { stats.skipped++; continue; }
    try {
      const rel = pngPath(paths, name);
      if (!rel) throw new Error('no 3D png in repo');
      const img = await download(rel);
      const r = await fetch(`${BASE}/api/admin/stickers?packId=${pack.id}&emoji=${encodeURIComponent(emoji)}`, {
        method: 'POST',
        // fresh inactivity cookie each call
        headers: { Cookie: cookieHeader(sess), 'Content-Type': 'image/png' },
        body: img,
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`upload HTTP ${r.status}`);
      stats.added++;
    } catch (e) {
      const m = String(e.message);
      if (m.startsWith('upload')) stats.upload_failed++; else stats.downloaded_failed++;
      failures.push(`${packName}/${name}: ${m}`);
    }
  }
}

console.log(JSON.stringify(stats));
if (failures.length) console.log('failures:\n' + failures.join('\n'));
