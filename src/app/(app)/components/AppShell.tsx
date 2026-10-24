'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, Home, LogOut, MessageCircle, Moon, MoreVertical, Settings, Shield, Sun } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { applyTheme, DEFAULT_ACCENT, isHex, isTheme } from '@/lib/theme';
import { resolveDark, savePrefs } from '@/lib/prefs';
import type { ConversationItem } from '@/lib/chat/types';
import Avatar from '@/components/ui/Avatar';
import { useLogout } from '@/components/ui/LogoutButton';
import ConversationList from './ConversationList';
import LocationGuard from './LocationGuard';
import OfflineBanner from '@/components/OfflineBanner';
import { ConversationsProvider, useConversations, type Me } from './ConversationsContext';
import '@/components/ui/ui.css';
import '../home.css';

export type { Me };

const item =
  'flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-main outline-none transition-colors hover:bg-panel-2 focus-visible:bg-panel-2';

type NavDef = { key: string; href: string; label: string; icon: typeof Home; match: (p: string) => boolean };

function navFor(isOwner: boolean): NavDef[] {
  const nav: NavDef[] = [
    { key: 'home', href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
    { key: 'chats', href: '/chats', label: 'Chats', icon: MessageCircle, match: (p) => p === '/chats' || p.startsWith('/c/') },
    { key: 'settings', href: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') || p.startsWith('/credits') },
  ];
  if (isOwner) nav.push({ key: 'admin', href: '/admin', label: 'Admin', icon: Shield, match: (p) => p.startsWith('/admin') });
  return nav;
}

/** Settings / Admin / Sign out popover. `side` decides where it opens. */
function UserMenu({ me, side, children }: { me: Me; side: 'below' | 'right'; children: (p: { toggle: () => void; open: boolean }) => React.ReactNode }) {
  const { ask: askLogout, dialog: logoutDialog } = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);

  // Light <-> dark in one tap (Settings still has Automatic). Remembered on this device and on the account.
  function flipTheme() {
    const root = document.documentElement;
    const next = dark ? 'light' : 'dark';
    const accent = root.style.getPropertyValue('--accent').trim();
    applyTheme(next, isHex(accent) ? accent : DEFAULT_ACCENT, null);
    setDark(!dark);
    void savePrefs(supabaseBrowser(), me.id, { theme: next, pack: null });
  }

  useEffect(() => {
    if (!open) return;
    const t = document.documentElement.getAttribute('data-theme');
    setDark(resolveDark(isTheme(t) ? t : 'light'));
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {children({ toggle: () => setOpen((v) => !v), open })}
      {logoutDialog}
      {open && (
        <div
          role="menu"
          className={`glass ring-glow absolute z-40 w-52 overflow-hidden rounded-2xl py-1 shadow-2xl ${
            side === 'right' ? 'hm-rail-menu bottom-0 left-full ml-3' : 'ui-menu right-0 top-11'
          }`}
        >
          <Link href="/settings" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <Settings className="h-4 w-4 text-accent" /> Settings
          </Link>
          {me.isOwner && (
            <Link href="/admin" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <Shield className="h-4 w-4 text-accent" /> Admin
            </Link>
          )}
          <button type="button" role="menuitem" onClick={flipTheme} className={item}>
            {dark ? <Sun className="h-4 w-4 text-accent" /> : <Moon className="h-4 w-4 text-accent" />}
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); askLogout(); }} className={item}>
            <LogOut className="h-4 w-4 text-accent" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

function Shell({ collapsedInit, children }: { collapsedInit?: boolean; children: React.ReactNode }) {
  const { me, items } = useConversations();
  const pathname = usePathname();
  const inChat = pathname.startsWith('/c/');
  const onChats = pathname === '/chats';
  const [collapsed, setCollapsed] = useState(!!collapsedInit); // tablet only
  const nav = navFor(me.isOwner);
  const active = nav.findIndex((n) => n.match(pathname));
  const unread = items.reduce((n, c) => n + c.unread, 0);
  const badge = unread > 99 ? '99+' : String(unread);

  // On phones the keyboard covers the page without resizing it. Track the visible area so the chat box stays above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
      if (vv.offsetTop > 0) window.scrollTo(0, 0); // iOS pushes the page up when the keyboard opens
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--app-h');
    };
  }, []);

  return (
    <div className="flex h-[var(--app-h,100dvh)] w-full max-w-full flex-col overflow-hidden text-main">
      <OfflineBanner userId={me.id} />
      <LocationGuard me={me.id} />
      <div className="flex min-h-0 w-full flex-1">
        {/* desktop rail */}
        <nav className="hm-rail" aria-label="Main">
          <span className="hm-logo" aria-hidden>
            L
          </span>
          <div className="hm-nav" style={{ ['--i' as string]: Math.max(active, 0) }}>
            <span className="hm-nav-ind" data-none={active < 0} aria-hidden />
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-label={n.label} data-tip={n.label} aria-current={n.match(pathname) ? 'page' : undefined} className="hm-nav-item">
                <n.icon className="h-5 w-5" aria-hidden />
                {n.key === 'chats' && unread > 0 && <span className="hm-nav-badge" aria-hidden>{badge}</span>}
              </Link>
            ))}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="ui-icon-btn max-md:!hidden lg:!hidden"
            aria-label={collapsed ? 'Show chat list' : 'Hide chat list'}
            aria-pressed={!collapsed}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>
          <UserMenu me={me} side="right">
            {({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={open}
                className="ui-avatar-ring ui-press block outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Avatar key={me.avatar ?? 'none'} userId={me.id} name={me.name} assetId={me.avatar} size={40} className="border-2 border-app" />
              </button>
            )}
          </UserMenu>
        </nav>

        {/* conversation list pane: phones only on /chats, always on md+ (unless collapsed on tablets) */}
        <aside
          className={`${onChats ? 'flex' : 'hidden'} ${collapsed ? 'md:hidden lg:flex' : 'md:flex'} w-full shrink-0 flex-col border-r border-line bg-app/60 md:w-72 lg:w-80 xl:w-96`}
          aria-label="Conversations"
        >
          <header className="safe-top relative z-20 flex items-center gap-2 border-b border-line bg-panel/70 px-3 py-2.5 backdrop-blur-md">
            <Link
              href="/settings"
              aria-label="Settings and profile"
              className="ui-press flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-accent md:pointer-events-none"
            >
              <span className="ui-avatar-ring shrink-0 md:hidden">
                <Avatar key={me.avatar ?? 'none'} userId={me.id} name={me.name} assetId={me.avatar} size={36} className="border-2 border-app" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold leading-tight">Chats</span>
                <span className="ui-gtext block truncate font-mono text-xs font-semibold">{me.name}</span>
              </span>
            </Link>
            <UserMenu me={me} side="below">
              {({ toggle, open }) => (
                <button type="button" onClick={toggle} className="ui-icon-btn" aria-label="Menu" aria-haspopup="menu" aria-expanded={open}>
                  <MoreVertical className="h-5 w-5" />
                </button>
              )}
            </UserMenu>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList activePath={pathname} />
          </div>
        </aside>

        {/* main pane: the page animates on route change (not in a chat, which has its own full screen layout) */}
        <main className={`${onChats ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col`}>
          <div key={inChat ? 'chat' : pathname} className={`${inChat ? '' : 'hm-page'} flex min-h-0 flex-1 flex-col`}>
            {children}
          </div>
        </main>
      </div>

      {/* phone bottom tab bar: hidden inside a conversation */}
      {!inChat && (
        <nav className="hm-tabbar !px-2 !pb-[calc(0.5rem+env(safe-area-inset-bottom))] !pt-1.5" aria-label="Main" style={{ ['--n' as string]: nav.length, ['--i' as string]: Math.max(active, 0) }}>
          <span className="hm-tab-ind !bottom-[calc(0.5rem+env(safe-area-inset-bottom))] !top-1.5" data-none={active < 0} aria-hidden />
          {nav.map((n) => (
            <Link key={n.key} href={n.href} aria-current={n.match(pathname) ? 'page' : undefined} className="hm-tab min-h-[3.25rem] !justify-center !text-xs">
              <n.icon className="h-5 w-5" aria-hidden />
              {n.key === 'chats' && unread > 0 && <span className="hm-tab-badge" aria-hidden>{badge}</span>}
              {n.label}
              {n.key === 'chats' && unread > 0 && <span className="sr-only">, {unread} unread</span>}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function AppShell({ me, initialConversations, children }: { me: Me; initialConversations: ConversationItem[]; children: React.ReactNode }) {
  return (
    <ConversationsProvider me={me} initial={initialConversations}>
      <Shell>{children}</Shell>
    </ConversationsProvider>
  );
}
