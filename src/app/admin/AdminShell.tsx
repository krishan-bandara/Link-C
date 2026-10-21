'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Avatar from '@/components/ui/Avatar';
import { Icon, type IconName } from './kit';
import { NoticeProvider } from './notices';

type Item = { href: string; label: string; icon: IconName };
const items: Item[] = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/members', label: 'Members', icon: 'users' },
  { href: '/admin/stickers', label: 'Stickers', icon: 'smile' },
  { href: '/admin/sms', label: 'SMS', icon: 'message' },
  { href: '/admin/settings', label: 'Limits', icon: 'sliders' },
  { href: '/admin/audit', label: 'Audit', icon: 'shield' },
];
const MORE = items.slice(4);

const isActive = (path: string, href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));

export default function AdminShell({
  owner,
  children,
}: {
  owner: { id: string; name: string; avatarAssetId: string | null };
  children: ReactNode;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setMore(false);
  }

  useEffect(() => {
    try {
      if (localStorage.getItem('ad-collapsed') === '1') setCollapsed(true);
    } catch {
      /* storage can be blocked */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('ad-collapsed', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  useEffect(() => {
    if (!more) return;
    const onDown = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMore(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMore(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [more]);

  const activeIdx = Math.max(
    0,
    items.findIndex((it) => isActive(path, it.href)),
  );
  const current = items[activeIdx] ?? items[0];
  const tabIdx = Math.min(activeIdx, 4); // Limits and Audit live under "More" on phones

  return (
    <NoticeProvider>
      <div className="ad-shell" data-collapsed={collapsed}>
        <div className="ad-aurora" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        {/* desktop sidebar */}
        <aside className="ad-side glass" aria-label="Admin sidebar">
          <Link href="/admin" className="ad-logo" aria-label="Link-C admin home">
            <span className="ad-logo-mark bg-grad">
              <Icon name="sparkle" size={18} />
            </span>
            <span className="ad-side-text">
              <b>Link-C</b>
              <small>Admin</small>
            </span>
          </Link>
          <nav aria-label="Admin" className="ad-nav">
            <span className="ad-ind" style={{ '--i': activeIdx } as CSSProperties} aria-hidden="true" />
            {items.map((it) => {
              const active = isActive(path, it.href);
              return (
                <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined} title={it.label} className="ad-navlink" data-active={active}>
                  <Icon name={it.icon} size={20} />
                  <span className="ad-side-text">{it.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ad-side-foot">
            <Link href="/" className="ad-navlink" title="Back to app">
              <Icon name="back" size={20} />
              <span className="ad-side-text">Back to app</span>
            </Link>
            <button type="button" className="ad-navlink" onClick={toggle} aria-pressed={collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <Icon name="panel" size={20} />
              <span className="ad-side-text">{collapsed ? 'Expand' : 'Collapse'}</span>
            </button>
          </div>
        </aside>

        <div className="ad-body">
          <header className="ad-top glass">
            <Link href="/admin" className="ad-top-logo bg-grad" aria-label="Link-C admin home">
              <Icon name="sparkle" size={16} />
            </Link>
            <p className="ad-top-title">{current.label}</p>
            <span className="flex-1" />
            <Link href="/" className="ad-top-back" aria-label="Back to app">
              <Icon name="back" size={16} />
              <span>Back to app</span>
            </Link>
            <div className="ad-owner" title={owner.name}>
              <span className="ad-owner-name">{owner.name}</span>
              <span className="ad-ring ad-ring-sm">
                <Avatar userId={owner.id} name={owner.name} assetId={owner.avatarAssetId} size={32} />
              </span>
            </div>
          </header>
          <main className="ad-main">
            <div key={path} className="ad-page">
              {children}
            </div>
          </main>
        </div>

        {/* phone bottom tab bar */}
        <div className="ad-tabs-wrap" ref={moreRef}>
          {more && (
            <div className="ad-sheet glass pop" role="menu" aria-label="More admin pages">
              {MORE.map((it) => (
                <Link key={it.href} href={it.href} role="menuitem" className="ad-sheet-item" aria-current={isActive(path, it.href) ? 'page' : undefined}>
                  <Icon name={it.icon} size={20} />
                  {it.label}
                </Link>
              ))}
              <Link href="/" role="menuitem" className="ad-sheet-item">
                <Icon name="back" size={20} />
                Back to app
              </Link>
            </div>
          )}
          <nav aria-label="Admin tabs" className="ad-tabs glass">
            <span className="ad-tab-ind" style={{ '--i': tabIdx } as CSSProperties} aria-hidden="true" />
            {items.slice(0, 4).map((it) => {
              const active = isActive(path, it.href);
              return (
                <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined} className="ad-tab" data-active={active}>
                  <Icon name={it.icon} size={21} />
                  <span>{it.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              className="ad-tab"
              data-active={tabIdx === 4}
              aria-expanded={more}
              aria-haspopup="menu"
              onClick={() => setMore((m) => !m)}
            >
              <Icon name="more" size={21} />
              <span>More</span>
            </button>
          </nav>
        </div>
      </div>
    </NoticeProvider>
  );
}
