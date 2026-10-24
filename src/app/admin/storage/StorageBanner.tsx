import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Icon } from '../kit';
import { loadStorage } from './data';

/** Red (critical) or amber (warn) banner shown at the top of the Admin home and Storage pages. */
export async function StorageBanner({ onStoragePage = false }: { onStoragePage?: boolean }) {
  const s = await loadStorage().catch(() => null);
  if (!s || s.level === 'ok') return null;
  const critical = s.level === 'critical';
  return (
    <div role="alert" className="ad-attn-item rise" style={{ '--tone': critical ? 'var(--ad-red)' : 'var(--ad-amber)' } as CSSProperties}>
      <span className="ad-stat-icon">
        <Icon name="alert" size={18} />
      </span>
      <div>
        <p>
          <strong>{critical ? 'Storage is almost full.' : 'Storage is getting full.'}</strong>{' '}
          {critical ? 'Free up space or raise the budget soon, or uploads may start failing.' : 'Keep an eye on it.'}
        </p>
        {!onStoragePage && <Link href="/admin/storage">Open Storage &rarr;</Link>}
      </div>
    </div>
  );
}
