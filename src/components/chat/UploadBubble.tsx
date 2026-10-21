'use client';

import { Loader2, X } from 'lucide-react';
import './chat.css';

export type UploadItem = {
  key: string;
  name: string;
  phase: 'uploading' | 'processing' | 'done' | 'error';
  sent: number;
  total: number;
  error?: string;
  uploadId?: string;
  serverId?: string; // the server's id as soon as the upload exists (used to cancel it)
};

export default function UploadBubble({
  item,
  onCancel,
  onDismiss,
}: {
  item: UploadItem;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const pct = item.total ? Math.round((item.sent / item.total) * 100) : 0;
  return (
    <div className="cv-in-mine mt-2 flex justify-end">
      <div className="cv-out w-64 max-w-[85%] rounded-[18px] rounded-br-md p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">{item.name}</span>
          {item.phase === 'error' ? (
            <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-muted">
              <X className="h-4 w-4" />
            </button>
          ) : (
            item.phase !== 'done' && (
              <button type="button" onClick={onCancel} aria-label="Cancel upload" className="shrink-0 text-muted">
                <X className="h-4 w-4" />
              </button>
            )
          )}
        </div>
        {item.phase === 'error' ? (
          <p className="mt-2 text-xs text-danger" role="alert">
            {item.error}
          </p>
        ) : item.phase === 'uploading' ? (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-grad transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">Uploading {pct}%</p>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {item.phase === 'done' ? 'Delivering' : 'Securing and processing'}
          </p>
        )}
      </div>
    </div>
  );
}
