'use client';

import { useState } from 'react';
import { EmptyState, Timeline, auditMeta, type IconName, type StatTone } from '../kit';

export type AuditRow = { id: string | number; actor: string; action: string; target: string; time: string; abs: string };

export function AuditList({ rows }: { rows: AuditRow[] }) {
  const [group, setGroup] = useState('All');
  const meta = rows.map((r) => ({ r, m: auditMeta(r.action) }));
  const groups = ['All', ...[...new Set(meta.map((x) => x.m.group))]];
  const count = (g: string) => (g === 'All' ? meta.length : meta.filter((x) => x.m.group === g).length);
  const shown = meta.filter((x) => group === 'All' || x.m.group === group);

  return (
    <div className="space-y-4">
      <div className="ad-chips" role="group" aria-label="Filter by kind of action">
        {groups.map((g) => (
          <button key={g} type="button" className="ad-chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
            {g} <b>{count(g)}</b>
          </button>
        ))}
      </div>
      <div className="ad-card rise">
        {shown.length ? (
          <Timeline
            label="Audit log"
            items={shown.map(({ r, m }) => ({
              id: r.id,
              icon: m.icon as IconName,
              tone: m.tone as StatTone,
              title: <span className="font-mono">{r.action}</span>,
              sub: (
                <>
                  by {r.actor}
                  {r.target ? <span className="font-mono"> &middot; {r.target}</span> : null}
                </>
              ),
              time: r.time,
              abs: r.abs,
            }))}
          />
        ) : (
          <EmptyState icon="shield" title="Nothing logged yet" text="Admin and security events will appear here." />
        )}
      </div>
    </div>
  );
}
