'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, MapPin, X } from 'lucide-react';
import type { LocationShare } from '@/lib/chat/types';
import { FOCUS } from './ui';
import './chat.css';

/** Requester (owner) view of a location share in this conversation. */
export default function LocationPanel({
  share,
  otherName,
  onStop,
}: {
  share: LocationShare | null;
  otherName: string;
  onStop: (id: string) => void;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!share) return null;
  const expired = share.expires_at ? new Date(share.expires_at).getTime() <= now : false;

  if (share.status === 'requested')
    return (
      <Bar>
        <MapPin className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate">Waiting for {otherName} to respond</span>
        <button type="button" onClick={() => onStop(share.id)} className={`shrink-0 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-panel-2 ${FOCUS}`}>
          Cancel request
        </button>
      </Bar>
    );

  if (share.status === 'active' && !expired) {
    const has = share.last_lat !== null && share.last_lng !== null;
    const url = has
      ? `https://www.openstreetmap.org/?mlat=${share.last_lat}&mlon=${share.last_lng}#map=16/${share.last_lat}/${share.last_lng}`
      : null;
    return (
      <Bar>
        <MapPin className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          {has ? (
            <>
              <span className="block truncate">
                {share.last_lat!.toFixed(5)}, {share.last_lng!.toFixed(5)}
                {share.last_accuracy ? ` (±${Math.round(share.last_accuracy)} m)` : ''}
              </span>
              <span className="block text-xs text-muted">
                Updated {share.last_at ? new Date(share.last_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
              </span>
            </>
          ) : (
            <span>Waiting for first location from {otherName}</span>
          )}
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex shrink-0 items-center gap-1 rounded-lg bg-accent/20 px-2 py-1 text-xs text-accent transition-colors hover:bg-accent/30 ${FOCUS}`}
          >
            Open in maps <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button type="button" onClick={() => onStop(share.id)} className={`shrink-0 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-panel-2 ${FOCUS}`}>
          Stop
        </button>
      </Bar>
    );
  }

  if (share.status === 'declined' && dismissed !== share.id)
    return (
      <Bar>
        <MapPin className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{otherName} declined to share their location</span>
        <button type="button" onClick={() => setDismissed(share.id)} aria-label="Dismiss" className={`shrink-0 rounded-full p-1 ${FOCUS}`}>
          <X className="h-4 w-4" />
        </button>
      </Bar>
    );
  return null;
}

function Bar({ children }: { children: React.ReactNode }) {
  return <div className="cv-bar flex items-center gap-2 px-3 py-2 text-sm" role="status">{children}</div>;
}
