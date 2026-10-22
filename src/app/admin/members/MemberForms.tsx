'use client';

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import './members.css';
import Avatar from '@/components/ui/Avatar';
import {
  createInvite,
  regenerateInvite,
  removeMember,
  resetPasswordLink,
  revokeInvite,
  setLoginDisabled,
  setMemberPhone,
  setMemberSmsTemplate,
  toggleMemberSms,
} from '../actions';
import { Badge, EmptyState, Icon, btnCls, btnDangerCls, btnGhostCls, inputCls } from '../kit';
import { ActionForm, Field, Modal, Popover, SmsTemplateField, Submit } from '../ui';

export type MemberView = {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  isSelf: boolean;
  avatarAssetId: string | null;
  online: boolean;
  lastSeen: string;
  disabled: boolean;
  phone: string;
  phoneVerified: boolean;
  smsOn: boolean;
  template: string;
};
export type PendingView = { email: string; name: string; phone: string; expired: boolean; until: string; expiresIn: string };

function InviteForm({ onDone }: { onDone: () => void }) {
  return (
    <ActionForm action={createInvite} className="space-y-4" reset onSuccess={onDone}>
      <p className="text-sm text-muted">
        You get a one-time link (works once, for 24 hours). They open it, choose a display name and a strong password, then sign in with their
        email and password.
      </p>
      <div className="ad-fields">
        <Field label="Email">
          <input name="email" type="email" required autoComplete="off" maxLength={254} className={inputCls} />
        </Field>
        <Field label="Display name">
          <input name="display_name" required maxLength={40} autoComplete="off" className={inputCls} />
        </Field>
        <Field label="Phone (optional)" hint="E.164, e.g. +94771234567">
          <input name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="+94..." className={inputCls} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Submit className={btnCls}>
          <Icon name="link" size={16} /> Create invite link
        </Submit>
      </div>
    </ActionForm>
  );
}

function PendingInviteActions({ email }: { email: string }) {
  const hidden = <input type="hidden" name="email" value={email} />;
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={regenerateInvite} inline>
        {hidden}
        <Submit className={`${btnGhostCls} ad-btn-sm`}>
          <Icon name="copy" size={15} /> Copy link (makes a new one)
        </Submit>
      </ActionForm>
      <ActionForm
        action={revokeInvite}
        inline
        danger
        confirmLabel="Revoke invitation"
        confirm="Revoke this invitation? The link stops working and they will not be able to join unless you invite them again."
      >
        {hidden}
        <Submit className={`${btnDangerCls} ad-btn-sm`}>
          <Icon name="x" size={15} /> Revoke
        </Submit>
      </ActionForm>
    </div>
  );
}

function MemberCard({ m, index, list }: { m: MemberView; index: number; list: boolean }) {
  const hidden = <input type="hidden" name="memberId" value={m.id} />;
  const canManage = !m.isSelf && !m.isOwner;
  const sm = `${btnGhostCls} ad-btn-sm`;
  return (
    <li className="ad-card ad-lift ad-pcard rise" data-off={m.disabled} style={{ animationDelay: `${Math.min(index, 12) * 45}ms` } as CSSProperties}>
      <div className="ad-ring">
        <span className="ad-pavatar">
          <Avatar userId={m.id} name={m.name} assetId={m.avatarAssetId} size={list ? 46 : 76} />
        </span>
        {m.online && <span className="ad-dot" role="img" aria-label="Online now" />}
      </div>
      <div className="min-w-0 max-w-full">
        <p className="ad-pname" title={m.name}>
          {m.name}
        </p>
        <p className="ad-pmail" title={m.email}>
          {m.email || 'no email'}
        </p>
      </div>
      {m.disabled && (
        <span className="mb-lock" role="img" aria-label="Login disabled" title="Login disabled">
          <Icon name="lock" size={15} />
        </span>
      )}
      <div className="ad-pmeta">
        {m.isOwner && <Badge tone="violet" icon="shield">Owner</Badge>}
        {m.disabled ? <Badge tone="bad" icon="ban">Login disabled</Badge> : <Badge tone="ok" icon="check">Active</Badge>}
      </div>
      <p className="ad-pseen">
        <Icon name="clock" size={14} />
        {m.online ? 'Online now' : `Last seen ${m.lastSeen}`}
      </p>
      <div className="ad-pmeta">
        <Badge tone={m.phoneVerified ? 'ok' : 'neutral'} icon={m.phoneVerified ? 'verified' : 'phone'}>
          {m.phoneVerified ? 'Phone verified' : 'Phone not verified (optional)'}
        </Badge>
        <Badge tone={m.smsOn ? 'pink' : 'neutral'} icon={m.smsOn ? 'bell' : 'bellOff'}>
          SMS {m.smsOn ? 'on' : 'off'}
        </Badge>
        <span className="mb-detail">
          <Badge icon="phone">{m.phone}</Badge>
        </span>
      </div>

      <div className="ad-pactions">
        <ActionForm action={resetPasswordLink} inline>
          {hidden}
          <Submit className={sm} title="Reset password link">
            <Icon name="key" size={15} /> Reset link
          </Submit>
        </ActionForm>
        {canManage && (
          <ActionForm
            action={setLoginDisabled}
            inline
            danger={!m.disabled}
            confirmLabel={m.disabled ? 'Enable login' : 'Disable login'}
            confirm={
              m.disabled
                ? `Let ${m.name} sign in again? They will need their email and password.`
                : `Disable login for ${m.name}? They are signed out within seconds and cannot sign in until you enable it again. Their messages are kept.`
            }
          >
            {hidden}
            <input type="hidden" name="disabled" value={String(!m.disabled)} />
            <Submit className={m.disabled ? sm : `${btnDangerCls} ad-btn-sm`} title={m.disabled ? 'Enable login' : 'Disable login'}>
              <Icon name={m.disabled ? 'unlock' : 'ban'} size={15} /> {m.disabled ? 'Enable' : 'Disable'}
            </Submit>
          </ActionForm>
        )}
        <ActionForm action={toggleMemberSms} inline>
          {hidden}
          <input type="hidden" name="on" value={String(!m.smsOn)} />
          <Submit className={`${sm} ad-switch`} role="switch" aria-checked={m.smsOn} aria-label="SMS alerts" title={m.smsOn ? 'Turn SMS alerts off' : 'Turn SMS alerts on'}>
            SMS
          </Submit>
        </ActionForm>
        <Popover label={`More actions for ${m.name}`}>
          <details>
            <summary>
              <Icon name="phone" size={15} /> Phone number
            </summary>
            <ActionForm action={setMemberPhone} className="mt-3 space-y-2" reset>
              {hidden}
              <input name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="+94771234567" aria-label={`Phone number for ${m.name}`} className={inputCls} />
              <p className="text-xs text-muted">Now: {m.phone}. Leave empty to remove it. Alerts are texted to this number.</p>
              <Submit className={sm}>Save number</Submit>
            </ActionForm>
          </details>
          <details>
            <summary>
              <Icon name="edit" size={15} /> Custom SMS text
            </summary>
            <ActionForm action={setMemberSmsTemplate} className="mt-3 space-y-2">
              {hidden}
              <SmsTemplateField initial={m.template} />
              <p className="text-xs text-muted">Leave empty to use the default text.</p>
              <Submit className={sm}>Save text</Submit>
            </ActionForm>
          </details>
          {canManage && (
            <>
              <hr className="ad-pop-sep" />
              <ActionForm
                action={removeMember}
                danger
                confirmLabel="Remove for good"
                confirm={`Remove ${m.name} and delete their media? This cannot be undone.`}
              >
                {hidden}
                <Submit className={`${btnDangerCls} ad-btn-sm w-full`}>
                  <Icon name="trash" size={15} /> Remove
                </Submit>
              </ActionForm>
            </>
          )}
        </Popover>
      </div>
    </li>
  );
}

function PendingCard({ p, index }: { p: PendingView; index: number }) {
  return (
    <li className="ad-card ad-lift ad-pend rise" style={{ animationDelay: `${Math.min(index, 12) * 45}ms` } as CSSProperties}>
      <div className="ad-pend-head">
        <span className="ad-pend-ico">
          <Icon name="mail" size={20} />
        </span>
        <div className="min-w-0">
          <p className="ad-pname" style={{ textAlign: 'left' }} title={p.name}>
            {p.name}
          </p>
          <p className="ad-pmail" style={{ textAlign: 'left' }} title={p.email}>
            {p.email}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={p.expired ? 'bad' : 'warn'} icon="clock">
          {p.expired ? 'Link expired' : `Invite pending until ${p.until}`}
        </Badge>
        <span className="ad-pend-count">{p.expiresIn}</span>
      </div>
      <p className="text-xs text-muted">Phone: {p.phone}</p>
      <PendingInviteActions email={p.email} />
    </li>
  );
}

type Filter = 'all' | 'active' | 'disabled' | 'pending';
type View = 'grid' | 'list';

/** Arrow keys move focus between cards (same button position in the neighbouring card). Ignored inside forms, menus and dialogs. */
function gridKeys(e: KeyboardEvent<HTMLUListElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target as HTMLElement;
  if (!(t instanceof HTMLButtonElement) || t.closest('dialog, .ad-pop')) return;
  const ul = e.currentTarget;
  const cards = Array.from(ul.children) as HTMLElement[];
  const cur = t.closest('li');
  const at = cards.indexOf(cur as HTMLElement);
  if (at < 0) return;
  const cols = getComputedStyle(ul).gridTemplateColumns.split(' ').length || 1;
  const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : cols;
  const next = cards[at + step];
  if (!next) return;
  const own = Array.from((cur as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter((b) => !b.closest('dialog, .ad-pop'));
  const there = Array.from(next.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter((b) => !b.closest('dialog, .ad-pop'));
  const target = there[Math.min(Math.max(own.indexOf(t), 0), there.length - 1)];
  if (!target) return;
  e.preventDefault();
  target.focus();
}

export function MembersView({ members, pending, openInvite }: { members: MemberView[]; pending: PendingView[]; openInvite: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setViewState] = useState<View>('grid');
  const [inviteOpen, setInviteOpen] = useState(openInvite);
  // Remembered per browser; read after mount so server and client markup match.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lc-members-view');
      if (saved === 'list' || (!saved && window.innerWidth < 640)) setViewState('list'); // phones: compact by default
    } catch {
      /* storage blocked: stay on grid */
    }
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem('lc-members-view', v);
    } catch {
      /* ignore */
    }
  };
  const gridCls = view === 'list' ? 'ad-pgrid mb-list' : 'ad-pgrid';
  // The dialog opens from the dashboard shortcut (?invite=1) once the page is ready.
  useEffect(() => {
    if (openInvite) setInviteOpen(true);
  }, [openInvite]);

  const needle = q.trim().toLowerCase();
  const match = (name: string, email: string) => !needle || name.toLowerCase().includes(needle) || email.toLowerCase().includes(needle);
  const shownMembers = useMemo(
    () =>
      members.filter((m) => {
        if (filter === 'pending') return false;
        if (filter === 'active' && m.disabled) return false;
        if (filter === 'disabled' && !m.disabled) return false;
        return match(m.name, m.email);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, filter, needle],
  );
  const shownPending = filter === 'all' || filter === 'pending' ? pending.filter((p) => match(p.name, p.email)) : [];
  const counts = {
    all: members.length,
    active: members.filter((m) => !m.disabled).length,
    disabled: members.filter((m) => m.disabled).length,
    pending: pending.length,
  };
  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'disabled', label: 'Disabled' },
    { id: 'pending', label: 'Pending' },
  ];
  const nothing = shownMembers.length === 0 && shownPending.length === 0;

  return (
    <>
      <div className="ad-toolbar">
        <div className="ad-search">
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search people by name or email" className={inputCls} />
        </div>
        <div className="ad-chips" role="group" aria-label="Filter people">
          {chips.map((c) => (
            <button key={c.id} type="button" className="ad-chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.label} <b>{counts[c.id]}</b>
            </button>
          ))}
        </div>
        <div className="mb-seg ml-auto" role="group" aria-label="Layout">
          <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => setView('grid')}>
            <Icon name="dashboard" size={15} /> Grid
          </button>
          <button type="button" aria-pressed={view === 'list'} aria-label="List view" title="List view" onClick={() => setView('list')}>
            <Icon name="list" size={15} /> List
          </button>
        </div>
      </div>

      {filter !== 'pending' && (
        <section aria-labelledby="people-h" className="space-y-3">
          <h2 id="people-h" className="ad-h2">
            People <small>({shownMembers.length})</small>
          </h2>
          <ul className={gridCls} onKeyDown={gridKeys}>
            {filter === 'all' && !needle && (
              <li className="rise">
                <button type="button" className="ad-card ad-lift ad-invite w-full" onClick={() => setInviteOpen(true)} aria-haspopup="dialog">
                  <svg className="ad-dash" aria-hidden="true">
                    <defs>
                      <linearGradient id="ad-ig" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="var(--accent)" />
                        <stop offset="1" stopColor="var(--a2)" />
                      </linearGradient>
                    </defs>
                    <rect />
                  </svg>
                  <span className="ad-invite-plus">
                    <Icon name="plus" size={30} />
                  </span>
                  <b>Invite someone</b>
                  <span className="t">Get a one-time link to send them privately.</span>
                </button>
              </li>
            )}
            {shownMembers.map((m, i) => (
              <MemberCard key={m.id} m={m} index={i + 1} list={view === 'list'} />
            ))}
          </ul>
        </section>
      )}

      {shownPending.length > 0 && (
        <section aria-labelledby="pending-h" className="space-y-3">
          <h2 id="pending-h" className="ad-h2">
            Pending invitations <small>({shownPending.length})</small>
          </h2>
          <ul className={gridCls} onKeyDown={gridKeys}>
            {shownPending.map((p, i) => (
              <PendingCard key={p.email} p={p} index={i} />
            ))}
          </ul>
        </section>
      )}

      {nothing && (
        <EmptyState icon={filter === 'pending' ? 'mail' : 'search'} title={needle ? 'No one matches that search' : filter === 'pending' ? 'Nobody is waiting' : 'Nobody here yet'} text={filter === 'pending' ? 'New invitations show up here until they are accepted.' : 'Try another word or filter.'}>
          <button type="button" className={`${btnCls} mt-3`} onClick={() => setInviteOpen(true)}>
            <Icon name="userPlus" size={16} /> Invite someone
          </button>
        </EmptyState>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite someone">
        <InviteForm onDone={() => setInviteOpen(false)} />
      </Modal>
    </>
  );
}
