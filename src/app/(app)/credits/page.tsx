import { ExternalLink } from 'lucide-react';
import { CREDITS } from '@/lib/credits';
import PageHeader from '@/components/ui/PageHeader';
import '@/components/ui/ui.css';

export const metadata = { title: 'Credits - Link-C' };

export default function CreditsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PageHeader title="Credits" subtitle="// built with the work of others" back={{ href: '/settings', label: 'Back to settings' }} />
      <div className="mx-auto w-full max-w-2xl space-y-4 p-3 pb-10 sm:p-5">
        <ul className="space-y-3">
          {CREDITS.map((c, i) => (
            <li key={c.name} className="rise" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-card-hover glass ui-card flex items-start gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-main">{c.name}</span>
                    <span className="text-sm text-muted">by {c.by}</span>
                  </span>
                  {c.note && <span className="mt-0.5 block text-sm text-muted">{c.note}</span>}
                </span>
                <span className="bg-grad shrink-0 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold text-accent-ink">{c.license}</span>
                <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted" aria-label="Opens in a new tab" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
