'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Coins, Globe2, MailOpen, MessagesSquare, Settings, Shield, UserPlus } from 'lucide-react';
import '@/components/ui/ui.css';
import '../../home.css';
import EmptyState from '@/components/ui/EmptyState';
import StatTile from '@/components/ui/StatTile';
import Skeleton from '@/components/ui/Skeleton';
import { useMounted } from '@/components/ui/useMounted';
import { useConversations } from '../ConversationsContext';
import PersonCard from './PersonCard';
import AddToHome from './AddToHome';

function greetingFor(h: number) {
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function Chip({ href, icon: Icon, children }: { href: string; icon: typeof Settings; children: React.ReactNode }) {
  return (
    <Link href={href} className="hm-chip ui-press">
      <Icon className="h-4 w-4 text-accent" aria-hidden />
      {children}
    </Link>
  );
}

function GridSkeleton() {
  return (
    <ul className="hm-grid" aria-label="Loading people">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="glass hm-card" style={{ animation: 'none' }}>
          <Skeleton round className="h-[82px] w-[82px]" />
          <span className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </span>
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

/** Signed-in home: greeting hero, stats, quick actions and one glass card per conversation. */
export default function HomeDashboard() {
  const { me, items, typing, online, loaded } = useConversations();
  const mounted = useMounted();
  const first = me.name.trim().split(/\s+/)[0] || me.name;

  const unread = useMemo(() => items.reduce((n, c) => n + c.unread, 0), [items]);
  const onlineNow = useMemo(() => items.filter((c) => online[c.id]).length, [items, online]);
  const today = useMemo(() => {
    if (!mounted) return 0;
    const d = new Date().toDateString();
    return items.filter((c) => c.lastAt && new Date(c.lastAt).toDateString() === d).length;
  }, [items, mounted]);

  const hello = mounted ? greetingFor(new Date().getHours()) : 'Welcome';
  const sub = !items.length
    ? (me.isOwner ? 'Your space is ready. Invite someone to start talking.' : 'Your space is ready. Your chats will show up here.')
    : unread > 0
      ? `You have ${unread} unread ${unread === 1 ? 'message' : 'messages'}${onlineNow ? ` and ${onlineNow} ${onlineNow === 1 ? 'person' : 'people'} here right now.` : '.'}`
      : onlineNow
        ? `${onlineNow} ${onlineNow === 1 ? 'person is' : 'people are'} here right now. You are all caught up.`
        : 'You are all caught up.';

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-3 pb-8 pt-3 sm:px-6 sm:pt-6">
        <section className="hm-hero glass rise" aria-labelledby="hm-hello">
          <div className="ui-aurora" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <p className="ui-step ui-cursor">{`// ${hello.toLowerCase()}`}</p>
          <h1 id="hm-hello" className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            {hello}, <span className="ui-gtext">{first}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">{sub}</p>

          <div className="mt-5 grid grid-cols-1 gap-2.5 min-[420px]:max-md:grid-cols-3 min-[1100px]:grid-cols-3">
            <StatTile icon={MailOpen} label="Unread messages" value={unread} />
            <StatTile icon={Globe2} label="Online now" value={onlineNow} />
            <StatTile icon={MessagesSquare} label="Chats active today" value={today} />
          </div>
        </section>

        <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
          <Chip href="/settings" icon={Settings}>
            Settings
          </Chip>
          <Chip href="/credits" icon={Coins}>
            Credits
          </Chip>
          {me.isOwner && (
            <>
              <Chip href="/admin" icon={Shield}>
                Admin
              </Chip>
              <Chip href="/admin/members" icon={UserPlus}>
                Invite someone
              </Chip>
            </>
          )}
        </nav>

        <AddToHome />

        <section aria-labelledby="hm-people">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="hm-people" className="text-lg font-semibold">
              People
            </h2>
            {items.length > 0 && <span className="ui-step">{`${items.length} ${items.length === 1 ? 'chat' : 'chats'}`}</span>}
          </div>
          {!loaded ? (
            <GridSkeleton />
          ) : items.length === 0 ? (
            <div className="glass ui-sheet">
              <EmptyState
                illustration={<NobodyIllustration />}
                title="Nobody here yet"
                description={me.isOwner ? 'Invite someone and your first conversation will appear here.' : 'Ask the owner for an invite and your conversations will appear here.'}
                action={
                  me.isOwner ? (
                    <Link href="/admin/members" className="ui-btn">
                      <UserPlus className="h-4 w-4" aria-hidden /> Invite someone
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="hm-grid">
              {items.map((c, i) => (
                <PersonCard key={c.id} c={c} idx={i} online={!!online[c.id]} typing={!!typing[c.id]} mounted={mounted} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Three empty avatar circles orbiting a dotted ring: "nobody here yet". */
function NobodyIllustration() {
  return (
    <svg className="ui-float h-44 w-44" viewBox="0 0 200 200" fill="none" aria-hidden>
      <defs>
        <linearGradient id="hm-nb-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--a2)" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="84" stroke="var(--c-line)" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
      <circle cx="100" cy="100" r="56" fill="url(#hm-nb-g)" opacity="0.1" />
      <circle cx="100" cy="100" r="32" fill="var(--c-panel)" stroke="url(#hm-nb-g)" strokeWidth="3" strokeDasharray="5 6" strokeLinecap="round" />
      <circle cx="100" cy="92" r="9" stroke="url(#hm-nb-g)" strokeWidth="3" />
      <path d="M82 118c3-10 9-14 18-14s15 4 18 14" stroke="url(#hm-nb-g)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="16" r="9" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="2" />
      <circle cx="174" cy="132" r="9" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="2" />
      <circle cx="26" cy="132" r="9" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="2" />
      <circle cx="40" cy="50" r="2.5" fill="var(--accent)" className="ui-twinkle" />
      <circle cx="166" cy="56" r="2" fill="var(--a2)" className="ui-twinkle" style={{ animationDelay: '1s' }} />
      <circle cx="150" cy="176" r="3" fill="var(--accent)" className="ui-twinkle" style={{ animationDelay: '2s' }} />
    </svg>
  );
}
