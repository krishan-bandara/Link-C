import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import './ui.css';

/** Sticky frosted header for full pages. `back` shows an arrow link; `backOnPhoneOnly` hides it from md up. */
export default function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string; phoneOnly?: boolean };
  actions?: ReactNode;
}) {
  return (
    <header className="ui-pageheader safe-top">
      {back && (
        <Link href={back.href} aria-label={back.label} className={`ui-icon-btn ${back.phoneOnly ? 'md:!hidden' : ''}`}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="ui-step truncate">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
