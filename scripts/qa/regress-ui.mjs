// Browser regression: the location prompt must reach the member live (no reload), stale prompts clear cleanly.
import { chromium } from 'playwright';
import { admin, loginUrl, BASE, OWNER_EMAIL, MEMBER_EMAIL } from './helpers.mjs';

const db = admin();
const out = [];
const check = (n, ok, e = '') => {
  out.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${e ? ' - ' + e : ''}`);
};

const { data: conv } = await db.from('conversations').select('id').limit(1).single();
await db.from('location_shares').delete().eq('conversation_id', conv.id);
await db.from('profiles').update({ notice_accepted_at: new Date().toISOString() }).eq('display_name', 'QA Member');
await db.from('profiles').update({ notice_accepted_at: new Date().toISOString() }).eq('role', 'owner');

const browser = await chromium.launch({ channel: 'msedge' });
async function login(email, perms = []) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: perms, geolocation: { latitude: 6.9271, longitude: 79.8612 } });
  const page = await ctx.newPage();
  await page.goto(await loginUrl(email));
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth') && !u.pathname.startsWith('/login'), { timeout: 20000 });
  return page;
}
const owner = await login(OWNER_EMAIL);
const member = await login(MEMBER_EMAIL, ['geolocation']);
await owner.goto(`${BASE}/c/${conv.id}`);
await member.goto(`${BASE}/`);
await member.waitForTimeout(3000); // let realtime connect

// owner asks while the member is just sitting on the app
await owner.getByRole('button', { name: /request location/i }).click();
const prompt = member.getByRole('alertdialog', { name: /location request/i });
let live = true;
try {
  await prompt.waitFor({ timeout: 8000 });
} catch {
  live = false;
}
check('member sees the location prompt live, without reloading', live);
if (live) {
  const text = await prompt.innerText();
  check('prompt starts with a capital letter (name or "The owner")', /^[A-Z]/.test(text.trim()), text.split('\n')[0]);
  await member.getByRole('button', { name: /accept 15 min/i }).click();
  await member.getByRole('status').filter({ hasText: /sharing your location/i }).waitFor({ timeout: 8000 });
  check('member sees the sharing banner after accepting', true);
  await member.waitForTimeout(4000);
  const { data: sh } = await db.from('location_shares').select('status,last_lat').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1).single();
  check('server received a position', sh.status === 'active' && sh.last_lat != null, `${sh.status} ${sh.last_lat}`);
  await member.getByRole('button', { name: /^stop$/i }).click();
  await member.waitForTimeout(1500);
  const { data: sh2 } = await db.from('location_shares').select('status,last_lat').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1).single();
  check('stop clears coordinates', sh2.status === 'stopped' && sh2.last_lat == null, sh2.status);
}

// stale prompt: owner asks, then the request is cancelled behind the member's back, member answers
await db.from('location_shares').delete().eq('conversation_id', conv.id);
await owner.reload();
await owner.getByRole('button', { name: /request location/i }).click();
await prompt.waitFor({ timeout: 8000 }).catch(() => {});
await db.from('location_shares').update({ status: 'stopped' }).eq('conversation_id', conv.id);
await member.getByRole('button', { name: /decline/i }).click().catch(() => {});
await member.waitForTimeout(1500);
const err = await member.getByText(/did not work/i).count();
check('answering a stale prompt shows no error', err === 0);

await db.from('location_shares').delete().eq('conversation_id', conv.id);
await browser.close();
console.log(`\n${out.filter(Boolean).length}/${out.length} checks passed`);
process.exit(out.every(Boolean) ? 0 : 1);
