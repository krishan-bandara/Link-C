'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, ChevronRight, Heart, KeyRound, LogOut, Palette, Plus, Smile, Trash2, User, Lock, type LucideIcon } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { applyTheme, packInfo, type PackId, type Theme } from '@/lib/theme';
import { DEFAULT_ABOUT, deleteAsset, resolveDark, savePrefs, uploadAsset, type Prefs, type WallpaperKind } from '@/lib/prefs';
import PhotoPicker from '@/components/ui/PhotoPicker';
import ThemePicker from '@/components/ui/ThemePicker';
import PackPicker from '@/components/ui/PackPicker';
import AccentPicker from '@/components/ui/AccentPicker';
import WallpaperPicker from '@/components/ui/WallpaperPicker';
import { useToast } from '@/components/ui/Toast';
import PasswordField from '@/components/auth/PasswordField';
import StrengthMeter from '@/components/auth/StrengthMeter';
import Card, { CardTitle } from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import SoundToggle from '@/components/SoundToggle';
import '@/components/ui/ui.css';
import '../home.css';

type Sticker = { id: string; emoji: string | null };

function Section({ title, icon, index, wide, children }: { title: string; icon: LucideIcon; index: number; wide?: boolean; children: React.ReactNode }) {
  return (
    <Card as="section" padding="lg" className={`rise space-y-4 ${wide ? '@2xl:col-span-2' : ''}`} style={{ animationDelay: `${index * 60}ms` }} aria-labelledby={`sec-${index}`}>
      <CardTitle id={`sec-${index}`} icon={icon}>
        {title}
      </CardTitle>
      {children}
    </Card>
  );
}

export default function SettingsClient({
  userId,
  email,
  initial,
  prefs,
}: {
  userId: string;
  email: string;
  initial: { name: string; about: string; avatar: string | null; sms: boolean };
  prefs: Prefs;
}) {
  const router = useRouter();
  const { toast, node } = useToast();
  const [name, setName] = useState(initial.name);
  const [about, setAbout] = useState(initial.about);
  const [avatar, setAvatar] = useState(initial.avatar);
  const [sms, setSms] = useState(initial.sms);
  const [theme, setTheme] = useState<Theme>(prefs.theme);
  const [accent, setAccent] = useState(prefs.accent);
  const [pack, setPack] = useState<PackId | null>(prefs.pack);
  const [wKind, setWKind] = useState<WallpaperKind>(prefs.wallpaperKind);
  const [wPreset, setWPreset] = useState(prefs.wallpaperPreset);
  const [wAsset, setWAsset] = useState(prefs.wallpaperAssetId);
  const [wBusy, setWBusy] = useState(false);
  const [dark, setDark] = useState(false);
  const [stickers, setStickers] = useState<Sticker[] | null>(null);
  const [emoji, setEmoji] = useState('');
  const [sBusy, setSBusy] = useState(false);
  const stickerFile = useRef<HTMLInputElement>(null);

  // change password
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confPw, setConfPw] = useState('');
  const [pwStrong, setPwStrong] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const pwValid = curPw.length > 0 && newPw.length > 0 && pwStrong && newPw === confPw && newPw !== curPw;

  useEffect(() => {
    setDark(resolveDark(theme));
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);

  const loadStickers = useCallback(async () => {
    const res = await fetch('/api/stickers').catch(() => null);
    const j = res?.ok ? ((await res.json().catch(() => null)) as { mine?: Sticker[] } | null) : null;
    setStickers(j?.mine ?? []);
  }, []);
  useEffect(() => void loadStickers(), [loadStickers]);

  async function saveProfile(patch: { display_name?: string; about?: string; sms_alerts_enabled?: boolean }) {
    const { error } = await supabaseBrowser().from('profiles').update(patch).eq('id', userId);
    if (error) toast('Could not save. Try again.', true);
    else {
      toast('Saved');
      router.refresh();
    }
    return !error;
  }
  async function savePref(patch: Parameters<typeof savePrefs>[2]) {
    const ok = await savePrefs(supabaseBrowser(), userId, patch);
    toast(ok ? 'Saved' : 'Could not save. Try again.', !ok);
    if (ok) router.refresh();
    return ok;
  }

  const nameBlur = () => {
    const v = name.trim();
    if (!v) return setName(initial.name);
    if (v !== initial.name) void saveProfile({ display_name: v });
  };
  const aboutBlur = () => {
    const v = about.trim() || DEFAULT_ABOUT;
    setAbout(v);
    if (v !== initial.about) void saveProfile({ about: v });
  };

  async function uploadWallpaper(f: File) {
    setWBusy(true);
    const id = await uploadAsset('wallpaper', f);
    setWBusy(false);
    if (!id) return toast('That picture could not be uploaded.', true);
    setWAsset(id);
    setWKind('custom');
    void savePref({ wallpaper_kind: 'custom' });
  }
  async function removeWallpaper() {
    setWBusy(true);
    const ok = await deleteAsset('wallpaper');
    setWBusy(false);
    if (!ok) return toast('Could not remove it.', true);
    setWAsset(null);
    setWKind('preset');
    void savePref({ wallpaper_kind: 'preset', wallpaper_preset: wPreset });
  }

  async function createSticker(f: File) {
    setSBusy(true);
    const q = emoji.trim() ? `?emoji=${encodeURIComponent(emoji.trim())}` : '';
    const res = await fetch(`/api/stickers${q}`, { method: 'POST', body: f }).catch(() => null);
    setSBusy(false);
    if (!res?.ok) return toast('Could not create the sticker.', true);
    setEmoji('');
    toast('Sticker added');
    void loadStickers();
  }
  async function deleteSticker(id: string) {
    const res = await fetch(`/api/stickers/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return toast('Could not delete the sticker.', true);
    setStickers((s) => s?.filter((x) => x.id !== id) ?? s);
    toast('Sticker deleted');
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwValid || pwBusy) return;
    setPwBusy(true);
    setPwError('');
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: curPw, next: newPw }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setPwBusy(false);
    if (res?.ok) {
      setCurPw('');
      setNewPw('');
      setConfPw('');
      toast('Password changed');
    } else setPwError(j?.error ?? 'Could not change the password. Please try again.');
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PageHeader title="Settings" subtitle="// make it yours" />
      <div className="@container mx-auto w-full max-w-4xl space-y-4 p-3 pb-10 sm:p-5">
        <section className="hm-set-hero glass rise p-4 sm:p-6" aria-labelledby="sec-profile">
          <div className="ui-aurora" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <h2 id="sec-profile" className="sr-only">
            Profile
          </h2>
          <div className="flex flex-col items-center gap-5 @xl:flex-row @xl:items-center @xl:gap-8">
            <PhotoPicker
              userId={userId}
              name={name || initial.name}
              assetId={avatar}
              size={104}
              onFile={async (f) => {
                const id = await uploadAsset('avatar', f);
                if (!id) {
                  toast('That photo could not be uploaded.', true);
                  return false;
                }
                setAvatar(id);
                toast('Photo updated');
                router.refresh();
                return true;
              }}
              onRemove={async () => {
                if (await deleteAsset('avatar')) {
                  setAvatar(null);
                  toast('Photo removed');
                  router.refresh();
                } else toast('Could not remove the photo.', true);
              }}
            />
            <div className="w-full min-w-0 flex-1 space-y-3">
              <p className="ui-step text-center @xl:text-left">{'// your profile'}</p>
              <div className="space-y-1">
                <label htmlFor="s-name" className="text-sm text-muted">
                  Name
                </label>
                <input id="s-name" className="ui-field" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onBlur={nameBlur} />
              </div>
              <div className="space-y-1">
                <label htmlFor="s-about" className="text-sm text-muted">
                  About
                </label>
                <input id="s-about" className="ui-field" maxLength={140} value={about} onChange={(e) => setAbout(e.target.value)} onBlur={aboutBlur} />
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 items-start gap-4 @2xl:grid-cols-2">
        <Section title="Appearance" icon={Palette} index={1} wide>
          <div className="space-y-2">
            <h3 className="text-sm text-muted">Theme</h3>
            <ThemePicker
              value={theme}
              onChange={(t) => {
                setTheme(t);
                setPack(null);
                applyTheme(t, accent, null);
                void savePref({ theme: t, pack: null });
              }}
            />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm text-muted">Theme packs</h3>
            <PackPicker
              value={pack}
              onChange={(id) => {
                setPack(id);
                if (id) {
                  const p = packInfo(id)!;
                  setTheme(p.mode);
                  setAccent(p.accent);
                  setWPreset(p.wallpaper);
                  setWKind('preset');
                  applyTheme(p.mode, p.accent, id);
                  void savePref({ theme: p.mode, pack: id, accent: p.accent, wallpaper_kind: 'preset', wallpaper_preset: p.wallpaper });
                } else {
                  applyTheme(theme, accent, null);
                  void savePref({ pack: null });
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm text-muted">Accent colour</h3>
            <AccentPicker
              value={accent}
              onChange={(a) => {
                setAccent(a);
                applyTheme(theme, a);
                void savePref({ accent: a });
              }}
            />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm text-muted">Chat wallpaper</h3>
            <WallpaperPicker
              kind={wKind}
              preset={wPreset}
              assetId={wAsset}
              dark={dark}
              busy={wBusy}
              onPreset={(id) => {
                setWPreset(id);
                setWKind('preset');
                void savePref({ wallpaper_kind: 'preset', wallpaper_preset: id });
              }}
              onNone={() => {
                setWKind('none');
                void savePref({ wallpaper_kind: 'none' });
              }}
              onCustom={() => {
                setWKind('custom');
                void savePref({ wallpaper_kind: 'custom' });
              }}
              onUpload={uploadWallpaper}
              onRemoveCustom={removeWallpaper}
            />
          </div>
        </Section>

        <Section title="Notifications" icon={Bell} index={2}>
          <SoundToggle />
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p id="sms-label" className="font-medium">
                Text message alerts
              </p>
              <p id="sms-desc" className="text-sm text-muted">
                When you are offline with unread messages, we send a few texts a day that look like an ordinary system message and never mention the app.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sms}
              aria-labelledby="sms-label"
              aria-describedby="sms-desc"
              onClick={() => {
                const v = !sms;
                setSms(v);
                void saveProfile({ sms_alerts_enabled: v }).then((ok) => !ok && setSms(!v));
              }}
              className="ui-switch mt-1"
            >
              <span />
            </button>
          </div>
        </Section>

        <Section title="Account" icon={User} index={5}>
          <div className="space-y-1">
            <label htmlFor="s-email" className="text-sm text-muted">
              Email
            </label>
            <input id="s-email" className="ui-field" value={email} readOnly />
          </div>
          <button type="button" onClick={signOut} className="ui-btn-outline !text-danger">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </Section>
        <Section title="My stickers" icon={Smile} index={3} wide>
          {stickers === null ? (
            <ul className="grid grid-cols-4 gap-3 sm:grid-cols-5" aria-label="Loading stickers">
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="skeleton aspect-square rounded-xl" />
              ))}
            </ul>
          ) : stickers.length === 0 ? (
            <p className="text-sm text-muted">You have no stickers yet.</p>
          ) : (
            <ul className="grid grid-cols-4 gap-3 sm:grid-cols-5">
              {stickers.map((s) => (
                <li key={s.id} className="pop glass relative aspect-square rounded-xl p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/stickers/${s.id}/image`} alt={s.emoji ? `Sticker ${s.emoji}` : 'Sticker'} className="h-full w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => void deleteSticker(s.id)}
                    aria-label={`Delete sticker ${s.emoji ?? ''}`}
                    className="ui-press absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white shadow outline-none focus-visible:ring-2 focus-visible:ring-main"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="s-emoji" className="text-sm text-muted">
                Emoji (optional)
              </label>
              <input id="s-emoji" className="ui-field !w-28" maxLength={8} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="😀" />
            </div>
            <button type="button" disabled={sBusy} onClick={() => stickerFile.current?.click()} className="ui-btn !px-4 !py-2.5 text-sm">
              <Plus className="h-4 w-4" aria-hidden /> {sBusy ? 'Uploading…' : 'Create sticker'}
            </button>
            <input
              ref={stickerFile}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Choose a picture for the sticker"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void createSticker(f);
              }}
            />
          </div>
        </Section>

        <Section title="Security" icon={Lock} index={4}>
          <form onSubmit={changePassword} className="space-y-3" noValidate>
            <input type="text" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden className="sr-only" />
            <PasswordField id="pw-current" label="Current password" value={curPw} onChange={setCurPw} autoComplete="current-password" />
            <PasswordField id="pw-new" label="New password" value={newPw} onChange={setNewPw} autoComplete="new-password" describedBy="pw-meter" />
            <div id="pw-meter">
              {/* mounted only once typing starts: the checker is about 800 KB and should not load with the page */}
              {newPw && <StrengthMeter password={newPw} email={email} name={name} confirm={confPw} onValidChange={setPwStrong} />}
            </div>
            <PasswordField id="pw-confirm" label="Confirm new password" value={confPw} onChange={setConfPw} autoComplete="new-password" invalid={!!confPw && confPw !== newPw} />
            <p role="alert" aria-live="polite" className="min-h-5 text-sm text-danger">
              {pwError}
            </p>
            <button type="submit" disabled={!pwValid || pwBusy} className="ui-btn !px-5 !py-2.5 text-sm">
              <KeyRound className="h-4 w-4" aria-hidden /> {pwBusy ? 'Changing…' : 'Change password'}
            </button>
          </form>
          <p className="flex items-start gap-2 border-t border-line pt-3 font-mono text-xs text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            You are signed out automatically after 1 minute of inactivity
          </p>
        </Section>

        <Section title="Credits" icon={Heart} index={6}>
          <p className="text-sm text-muted">Fluent Emoji, libraries and everything else this app is built with.</p>
          <Link href="/credits" className="ui-btn-outline w-full justify-between">
            <span>See the credits</span>
            <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
          </Link>
        </Section>
        </div>
      </div>
      {node}
    </div>
  );
}
