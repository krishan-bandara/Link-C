/** Turn a user-agent string into a short device label like "Chrome on Android". */
export function describeDevice(ua: string | null | undefined): string {
  const s = (ua ?? '').trim();
  if (!s) return 'Unknown device';

  let os: string | null = null;
  if (/iPhone/i.test(s)) os = 'iPhone';
  else if (/iPad/i.test(s)) os = 'iPad';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/CrOS/i.test(s)) os = 'ChromeOS';
  else if (/Macintosh|Mac OS X/i.test(s)) os = 'Mac';
  else if (/Linux|X11/i.test(s)) os = 'Linux';

  let browser: string | null = null;
  if (/EdgiOS|EdgA|Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(s)) browser = 'Samsung Internet';
  else if (/Firefox|FxiOS/i.test(s)) browser = 'Firefox';
  else if (/Chrome|CriOS|Chromium/i.test(s)) browser = 'Chrome';
  else if (/Safari/i.test(s)) browser = 'Safari';

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return `Browser on ${os}`;
  return 'Unknown device';
}

/** "active now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or a date. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return 'unknown';
  const mins = Math.floor(Math.max(0, now - t) / 60000);
  if (mins < 2) return 'active now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(t).toLocaleDateString();
}
