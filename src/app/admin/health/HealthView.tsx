'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Avatar from '@/components/ui/Avatar';
import { colomboExact, relativeAgo, statusLabel, type HealthStatus } from '@/lib/memberHealth';
import { Badge, EmptyState, Icon, inputCls, type Tone } from '../kit';

export type HealthRow = {
  id: string;
  name: string;
  role: string;
  disabled: boolean;
  status: HealthStatus;
  days: number | null;
  attention: boolean;
  seenMs: number | null;
  signInMs: number | null;
  lastMs: number | null;
  sessions: number;
};

const TONE: Record<HealthStatus, Tone> = { active: 'ok', quiet: 'warn', inactive: 'bad', never: 'neutral' };

/** Relative text is only filled in after mount, so the server and first client render match. */
function Ago({ ms, now }: { ms: number | null; now: number | null }) {
  if (ms === null) return <span>never</span>;
  return (
    <span title={colomboExact(ms)} suppressHydrationWarning>
      {now === null ? ' ' : relativeAgo(ms, now)}
    </span>
  );
}

export default function HealthView({ rows }: { rows: HealthRow[] }) {
  const [now, setNow] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'attn'>('all');
  const [sort, setSort] = useState<'least' | 'recent'>('least');
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const attnCount = rows.filter((r) => r.attention).length;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => (filter === 'all' || r.attention) && (!needle || r.name.toLowerCase().includes(needle)));
    const key = (r: HealthRow) => r.lastMs ?? 0;
    return [...list].sort((a, b) => (sort === 'least' ? key(a) - key(b) : key(b) - key(a)));
  }, [rows, q, filter, sort]);

  return (
    <>
      <div className="ad-toolbar">
        <div className="ad-search">
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search members by name" className={inputCls} />
        </div>
        <div className="ad-chips" role="group" aria-label="Filter members">
          <button type="button" className="ad-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All <b>{rows.length}</b>
          </button>
          <button type="button" className="ad-chip" aria-pressed={filter === 'attn'} onClick={() => setFilter('attn')}>
            Needs attention <b>{attnCount}</b>
          </button>
        </div>
        <div className="ad-chips" role="group" aria-label="Sort order">
          <button type="button" className="ad-chip" aria-pressed={sort === 'least'} onClick={() => setSort('least')}>
            Least active first
          </button>
          <button type="button" className="ad-chip" aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}>
            Most recent first
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="users" title="No members match" text="Try another name or switch the filter back to All." />
      ) : (
        <ul className="space-y-3" aria-label="Member activity">
          {shown.map((r, i) => (
            <li key={r.id} className="ad-card ad-lift rise" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` } as CSSProperties}>
              <Link href="/admin/members" className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label={`${r.name}, open members`}>
                <span className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                  <Avatar userId={r.id} name={r.name} assetId={null} size={44} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold" title={r.name}>
                      {r.name}
                    </span>
                    <span className="block text-xs text-muted">{r.role === 'owner' ? 'Owner' : 'Member'}</span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {r.disabled && (
                    <Badge tone="violet" icon="ban">
                      Login disabled
                    </Badge>
                  )}
                  <Badge tone={TONE[r.status]}>{statusLabel(r.status, r.days)}</Badge>
                </span>
                <span className="grid basis-full gap-x-6 gap-y-1 text-sm sm:basis-auto sm:grid-cols-3">
                  <span>
                    <span className="text-muted">Last seen </span>
                    <Ago ms={r.seenMs} now={now} />
                  </span>
                  <span>
                    <span className="text-muted">Last login </span>
                    <Ago ms={r.signInMs} now={now} />
                  </span>
                  <span>
                    <span className="text-muted">Devices </span>
                    <b>{r.sessions}</b>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
