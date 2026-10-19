/* Server-safe building blocks for the admin panel (no 'use client' so server pages can import them). Styles live in admin.css (class prefix ad-). */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

/* ---------- class constants (plain strings, safe on server and client) ---------- */
export const inputCls = 'ad-input';
export const cardCls = 'ad-card rise';
export const btnCls = 'ad-btn';
export const btnGhostCls = 'ad-btn ad-btn-ghost';
export const btnDangerCls = 'ad-btn ad-btn-danger';

/* ---------- icons ---------- */
const paths = {
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  smile: (<><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></>),
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  shield: (<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>),
  back: <path d="m12 19-7-7 7-7M19 12H5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  more: (<><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>),
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  check: <path d="M20 6 9 17l-5-5" />,
  key: (<><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2" /></>),
  ban: (<><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>),
  unlock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>),
  lock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  bell: (<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  bellOff: (<><path d="M6 8a6 6 0 0 1 9.5-4.9M18 8c0 3 .6 5 1.5 6.5M3 17s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /><path d="m2 2 20 20" /></>),
  phone: (<><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>),
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  mail: (<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>),
  clock: (<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>),
  alert: (<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
  server: (<><rect x="2" y="3" width="20" height="8" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><path d="M6 7h.01M6 17h.01" /></>),
  send: (<><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  panel: (<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>),
  camera: (<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>),
  disk: <path d="M22 12H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1zM6 16h.01M10 16h.01" />,
  userPlus: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
  link: (<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>),
  pin: (<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>),
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  verified: (<><path d="M12 2l2.4 2.1 3.2-.2.9 3.1 2.7 1.8-1 3 1 3-2.7 1.8-.9 3.1-3.2-.2L12 22l-2.4-2.1-3.2.2-.9-3.1L2.8 15l1-3-1-3 2.7-1.8.9-3.1 3.2.2z" /><path d="m9 12 2 2 4-4" /></>),
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`ad-icon ${className}`}
    >
      {paths[name]}
    </svg>
  );
}

/* ---------- time helpers (run on the server, labels are passed to client components) ---------- */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', dateStyle: 'medium' });
}

export function expiresIn(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'expired';
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return 'expired';
  const m = Math.round(ms / 60000);
  if (m < 60) return `expires in ${Math.max(1, m)} min`;
  return `expires in ${Math.round(m / 60)} h`;
}

export const absUtc = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/* ---------- small components ---------- */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="ad-pagehead rise">
      <div className="min-w-0">
        <h1 className="ad-h1">
          <span className="text-grad">{title}</span>
        </h1>
        {subtitle && <p className="ad-sub">{subtitle}</p>}
      </div>
      {children && <div className="ad-pagehead-actions">{children}</div>}
    </header>
  );
}

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'violet' | 'pink';
export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`ad-badge ad-t-${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/** A number that counts up with CSS only. The real value is in the DOM for screen readers and for reduced motion. */
export function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const n = Math.max(0, Math.round(value));
  return (
    <span className="ad-count" style={{ '--v': n, '--d': `${delay}ms` } as CSSProperties}>
      <span className="sr-only">{n}</span>
    </span>
  );
}

export type StatTone = 'cyan' | 'violet' | 'pink' | 'amber' | 'green' | 'red';
export function StatTile({
  icon,
  label,
  value,
  text,
  suffix,
  sub,
  tone = 'cyan',
  href,
  index = 0,
}: {
  icon: IconName;
  label: string;
  value?: number;
  text?: string;
  suffix?: string;
  sub?: string;
  tone?: StatTone;
  href?: string;
  index?: number;
}) {
  const body = (
    <>
      <span className="ad-stat-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="ad-stat-label">{label}</span>
      <span className="ad-stat-num">
        {value !== undefined ? <CountUp value={value} delay={index * 60} /> : text}
        {suffix && <small>{suffix}</small>}
      </span>
      {sub && <span className="ad-stat-sub">{sub}</span>}
    </>
  );
  const style = { '--tone': `var(--ad-${tone})`, animationDelay: `${index * 60}ms` } as CSSProperties;
  return href ? (
    <Link href={href} className="ad-stat ad-lift rise" style={style}>
      {body}
    </Link>
  ) : (
    <div className="ad-stat ad-lift rise" style={style}>
      {body}
    </div>
  );
}

export function EmptyState({ icon = 'sparkle', title, text, children }: { icon?: IconName; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="ad-empty rise">
      <div className="ad-empty-art" aria-hidden="true">
        <svg viewBox="0 0 160 120" width="160" height="120" fill="none">
          <defs>
            <linearGradient id="ad-eg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--accent)" />
              <stop offset="1" stopColor="var(--a2)" />
            </linearGradient>
          </defs>
          <ellipse cx="80" cy="62" rx="62" ry="46" fill="url(#ad-eg)" opacity="0.12" />
          <circle cx="80" cy="60" r="38" stroke="url(#ad-eg)" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.7" className="ad-orbit" />
          <rect x="44" y="34" width="72" height="52" rx="14" fill="var(--c-panel)" stroke="url(#ad-eg)" strokeWidth="1.5" />
          <circle cx="24" cy="30" r="3" fill="var(--accent)" opacity="0.8" />
          <circle cx="140" cy="86" r="4" fill="var(--a2)" opacity="0.8" />
          <circle cx="132" cy="24" r="2" fill="var(--ad-pink)" />
        </svg>
        <span className="ad-empty-icon">
          <Icon name={icon} size={26} />
        </span>
      </div>
      <h3 className="ad-empty-title">{title}</h3>
      {text && <p className="ad-empty-text">{text}</p>}
      {children}
    </div>
  );
}

/* ---------- timeline (SMS delivery log, audit log) ---------- */
export type TimelineItem = {
  id: string | number;
  icon: IconName;
  tone: StatTone;
  title: ReactNode;
  sub?: ReactNode;
  time: string;
  abs?: string;
};

export function Timeline({ items, label }: { items: TimelineItem[]; label: string }) {
  return (
    <ol className="ad-tl" aria-label={label}>
      {items.map((it) => (
        <li key={it.id} className="ad-tl-item" style={{ '--tone': `var(--ad-${it.tone})` } as CSSProperties}>
          <span className="ad-tl-dot">
            <Icon name={it.icon} size={15} />
          </span>
          <div className="ad-tl-body">
            <p className="ad-tl-title">{it.title}</p>
            {it.sub && <p className="ad-tl-sub">{it.sub}</p>}
          </div>
          <time className="ad-tl-time" title={it.abs} dateTime={it.abs}>
            {it.time}
          </time>
        </li>
      ))}
    </ol>
  );
}

/** Colour, icon and filter group for an audit action name. */
export function auditMeta(action: string): { group: string; icon: IconName; tone: StatTone } {
  const a = action.toLowerCase();
  if (a.includes('sms')) return { group: 'SMS', icon: 'message', tone: a.includes('failed') ? 'red' : 'cyan' };
  if (a.includes('sticker')) return { group: 'Stickers', icon: 'smile', tone: a.includes('removed') || a.includes('deleted') ? 'red' : 'pink' };
  if (a.includes('limits') || a.includes('settings')) return { group: 'Settings', icon: 'sliders', tone: 'amber' };
  if (a.includes('password') || a.includes('phone_verified') || a.includes('notice')) return { group: 'Security', icon: 'key', tone: 'violet' };
  if (a.startsWith('login_')) return { group: 'Security', icon: a.includes('disabled') ? 'ban' : 'unlock', tone: a.includes('disabled') ? 'red' : 'green' };
  if (a.startsWith('location')) return { group: 'Location', icon: 'pin', tone: 'violet' };
  if (a.includes('removed') || a.includes('revoked') || a.includes('deleted')) return { group: 'People', icon: 'trash', tone: 'red' };
  if (a.includes('invite')) return { group: 'People', icon: 'userPlus', tone: 'green' };
  if (a.startsWith('member')) return { group: 'People', icon: 'users', tone: 'green' };
  return { group: 'Other', icon: 'activity', tone: 'cyan' };
}
