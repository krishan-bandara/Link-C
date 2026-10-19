import { Fragment } from 'react';

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}]+$/;

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // No link for look-alike tricks: "https://good.com@evil.com" (login part hides the real host) and internationalised
    // (xn--) host names that can imitate another site. They stay as plain, unclickable text.
    if (u.username || u.password || u.hostname.split('.').some((p) => p.startsWith('xn--'))) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Renders text as plain text; only http/https URLs become links. Never uses dangerouslySetInnerHTML. */
export default function Linkify({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    const trail = m[0].match(TRAILING)?.[0] ?? '';
    const raw = trail ? m[0].slice(0, -trail.length) : m[0];
    const href = safeUrl(raw);
    if (!href) continue;
    if (idx > last) out.push(<Fragment key={n++}>{text.slice(last, idx)}</Fragment>);
    out.push(
      <a
        key={n++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-accent underline underline-offset-2"
      >
        {raw}
      </a>,
    );
    last = idx + raw.length;
  }
  if (last < text.length) out.push(<Fragment key={n++}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
