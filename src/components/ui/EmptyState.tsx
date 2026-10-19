import type { ReactNode } from 'react';
import './ui.css';

/** Default illustration: a floating chat bubble among twinkling stars (inline SVG, uses the accent tokens). */
export function ChatIllustration({ className = 'h-40 w-40' }: { className?: string }) {
  return (
    <svg className={`ui-float ${className}`} viewBox="0 0 200 200" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ui-es-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--a2)" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="86" stroke="var(--c-line)" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
      <circle cx="100" cy="100" r="64" fill="url(#ui-es-g)" opacity="0.1" />
      <path d="M62 78a14 14 0 0 1 14-14h48a14 14 0 0 1 14 14v30a14 14 0 0 1-14 14H96l-18 16v-16h-2a14 14 0 0 1-14-14z" fill="var(--c-panel)" stroke="url(#ui-es-g)" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="84" cy="93" r="4.5" fill="url(#ui-es-g)" />
      <circle cx="100" cy="93" r="4.5" fill="url(#ui-es-g)" opacity="0.8" />
      <circle cx="116" cy="93" r="4.5" fill="url(#ui-es-g)" opacity="0.6" />
      <circle cx="30" cy="60" r="2.5" fill="var(--accent)" className="ui-twinkle" />
      <circle cx="168" cy="48" r="2" fill="var(--a2)" className="ui-twinkle" style={{ animationDelay: '1s' }} />
      <circle cx="160" cy="150" r="3" fill="var(--accent)" className="ui-twinkle" style={{ animationDelay: '2s' }} />
      <circle cx="38" cy="148" r="2" fill="var(--a2)" className="ui-twinkle" style={{ animationDelay: '1.5s' }} />
    </svg>
  );
}

/** Friendly "nothing here" block: illustration, title, text and an optional action. */
export default function EmptyState({
  illustration,
  title,
  description,
  action,
  className = '',
}: {
  illustration?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ui-empty ${className}`}>
      <div className="rise">{illustration ?? <ChatIllustration />}</div>
      <p className="rise text-xl font-semibold" style={{ animationDelay: '80ms' }}>
        {title}
      </p>
      {description && (
        <p className="rise max-w-sm text-sm text-muted" style={{ animationDelay: '140ms' }}>
          {description}
        </p>
      )}
      {action && (
        <div className="rise mt-1" style={{ animationDelay: '200ms' }}>
          {action}
        </div>
      )}
    </div>
  );
}
