import webpush from 'web-push';

// No next/* imports here: this file is shared with the worker process.

export type PushSub = { endpoint: string; p256dh: string; auth: string };

/** Only the real push services of the big browsers. Stops a member from making the server call an internal address. */
const ALLOWED = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function allowedEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.port && ALLOWED.some((re) => re.test(u.hostname)) && raw.length <= 1000;
  } catch {
    return false;
  }
}

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

/** 'gone' means the phone removed the subscription, so delete it. */
export async function sendPush(sub: PushSub, payload: { title: string; body: string }): Promise<'ok' | 'gone' | 'error'> {
  if (!pushConfigured() || !allowedEndpoint(sub.endpoint)) return 'error';
  setup();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      TTL: 3600,
      urgency: 'high',
      timeout: 10_000,
    });
    return 'ok';
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? 'gone' : 'error';
  }
}
