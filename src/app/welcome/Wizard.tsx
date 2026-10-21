'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Rocket, Sparkles } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { applyTheme, type Theme } from '@/lib/theme';
import { WALLPAPER_PRESETS } from '@/lib/wallpapers';
import { DEFAULT_ABOUT, resolveDark, savePrefs, uploadAsset, type Prefs, type WallpaperKind } from '@/lib/prefs';
import Avatar from '@/components/ui/Avatar';
import ThemePicker from '@/components/ui/ThemePicker';
import AccentPicker from '@/components/ui/AccentPicker';
import WallpaperPicker from '@/components/ui/WallpaperPicker';
import MatrixRain from '@/components/auth/MatrixRain';
import TerminalCard, { StepLabel } from '@/components/auth/TerminalCard';
import Preview from './Preview';
import '@/components/ui/ui.css';

const STEPS = 7;
const LABELS = ['create(identity)', 'set(avatar)', 'write(about)', 'choose(theme)', 'pick(accent)', 'compose(wallpaper)', 'deploy(profile)'];
const HEADINGS = [
  ['Welcome to Link-C', 'Let us set things up in a minute. What should people call you?'],
  ['Add a profile photo', 'Drop one here, pick from your gallery or take a new one. You can skip this.'],
  ['Write a short About', 'A line under your name that your contacts can see.'],
  ['Choose a theme', 'Light, dark, or follow your device.'],
  ['Pick your colour', 'Buttons, badges and highlights use this colour.'],
  ['Chat wallpaper', 'The backdrop behind your messages. Only you see it.'],
  ['All set', 'Here is how it will look. You can change everything later in Settings.'],
] as const;
const SUGGESTIONS = ['Hey there! I am using Link-C', 'Busy', 'At work', 'Available', 'Battery about to die', 'Sleeping'];
const CONFETTI_COLORS = ['var(--accent)', 'var(--a2)', '#fbbf24', '#f472b6', '#5eead4', '#ffffff'];

type Piece = { id: number; dx: number; dy: number; rot: number; color: string; delay: number };

function makeConfetti(): Piece[] {
  return Array.from({ length: 46 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 46 + Math.random() * 0.5;
    const d = 120 + Math.random() * 180;
    return {
      id: i,
      dx: Math.cos(a) * d,
      dy: Math.sin(a) * d - 60,
      rot: Math.random() * 720 - 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 120,
    };
  });
}

export default function Wizard({
  userId,
  initialName,
  initialAbout,
  initialAvatar,
  initialPrefs,
}: {
  userId: string;
  initialName: string;
  initialAbout: string;
  initialAvatar: string | null;
  initialPrefs: Prefs;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [name, setName] = useState(initialName);
  const [about, setAbout] = useState(initialAbout);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialPrefs.theme);
  const [accent, setAccent] = useState(initialPrefs.accent);
  const [wKind, setWKind] = useState<WallpaperKind>(initialPrefs.wallpaperKind);
  const [wPreset, setWPreset] = useState(initialPrefs.wallpaperPreset);
  const [wAsset, setWAsset] = useState(initialPrefs.wallpaperAssetId);
  const [wBusy, setWBusy] = useState(false);
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confetti, setConfetti] = useState<Piece[] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    setDark(resolveDark(theme));
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);

  // per-step focus management: move focus to the step heading (the name field on the first screen)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      nameRef.current?.focus({ preventScroll: true });
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => () => void (localUrl && URL.revokeObjectURL(localUrl)), [localUrl]);

  const shownName = name.trim() || initialName || 'You';
  const nameOk = name.trim().length >= 1 && name.trim().length <= 40;
  const last = step === STEPS - 1;

  const go = useCallback((to: number) => {
    setDir(to > step ? 'fwd' : 'back');
    setError('');
    setStep(Math.max(0, Math.min(STEPS - 1, to)));
  }, [step]);

  function pickTheme(t: Theme) {
    setTheme(t);
    applyTheme(t, accent, null); // the wizard never has a pack: clear any left over from a previous person on this browser
  }
  function pickAccent(a: string) {
    setAccent(a);
    applyTheme(theme, a, null);
  }
  async function uploadWallpaper(f: File) {
    setWBusy(true);
    setError('');
    const id = await uploadAsset('wallpaper', f);
    setWBusy(false);
    if (!id) return setError('That picture could not be uploaded. Try another one.');
    setWAsset(id);
    setWKind('custom');
  }
  async function uploadAvatar(f: File | undefined) {
    if (!f || upBusy) return;
    if (!f.type.startsWith('image/')) return setError('Please choose a picture file.');
    setError('');
    setUpBusy(true);
    const url = URL.createObjectURL(f);
    setLocalUrl(url);
    const id = await uploadAsset('avatar', f);
    setUpBusy(false);
    if (!id) {
      setLocalUrl(null);
      return setError('That photo could not be uploaded. Try another one.');
    }
    setAvatar(id);
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError('');
    const supabase = supabaseBrowser();
    const { error: pe } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() || initialName, about: about.trim() || DEFAULT_ABOUT })
      .eq('id', userId);
    const ok =
      !pe &&
      (await savePrefs(supabase, userId, {
        theme,
        pack: null,
        accent,
        wallpaper_kind: wKind === 'custom' && !wAsset ? 'preset' : wKind,
        wallpaper_preset: wPreset,
        wizard_done_at: new Date().toISOString(),
      }));
    if (!ok) {
      setError('Could not save your choices. Please try again.');
      setBusy(false);
      return;
    }
    applyTheme(theme, accent, null);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setConfetti(makeConfetti());
    await new Promise((r) => setTimeout(r, reduce ? 600 : 1700));
    router.replace('/');
    router.refresh();
  }

  function onNext() {
    if (last) void finish();
    else if (step === 0 && !nameOk) return;
    else go(step + 1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.target as HTMLElement;
    if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'radio') return;
    e.preventDefault();
    if (!busy) onNext();
  }

  const wallpaperLabel =
    wKind === 'none' ? 'No wallpaper' : wKind === 'custom' ? 'Your picture' : (WALLPAPER_PRESETS.find((p) => p.id === wPreset)?.name ?? 'Doodle');
  const themeLabel = theme === 'system' ? 'Automatic' : theme === 'dark' ? 'Dark' : 'Light';
  const pct = (step / (STEPS - 1)) * 100;
  const first = shownName.split(/\s+/)[0];

  const stepBody = [
    // 1 name
    <div key="s0" className="mx-auto w-full max-w-sm space-y-2">
      <label htmlFor="w-name" className="block text-sm text-muted">
        Your name
      </label>
      <input
        id="w-name"
        ref={nameRef}
        className="ui-field"
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="How others see you"
        autoComplete="nickname"
        aria-describedby="w-name-hint"
      />
      <div className="flex items-start justify-between gap-3 text-xs text-muted">
        <p id="w-name-hint" className="min-w-0">
          {name.trim() ? `Nice to meet you, ${first}!` : 'Use the name your friends know you by. A first name is perfect.'}
        </p>
        <p className="shrink-0 font-mono">{name.trim().length}/40</p>
      </div>
    </div>,
    // 2 photo
    <div key="s1" className="flex flex-col items-center gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Add a profile photo: drop a picture here or press Enter to choose one"
        data-over={over}
        onClick={() => gallery.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            gallery.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void uploadAvatar(e.dataTransfer.files?.[0]);
        }}
        className="wz-drop h-44 w-44 sm:h-48 sm:w-48"
      >
        {localUrl || avatar ? (
          <>
            {localUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={localUrl} alt="Your new profile picture" className="h-full w-full rounded-full object-cover" />
            ) : (
              <Avatar key={avatar ?? 'none'} userId={userId} name={shownName} assetId={avatar} size={188} className="!h-full !w-full" />
            )}
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 px-6 text-center text-sm text-muted">
            <ImagePlus className="h-8 w-8 text-accent" aria-hidden />
            Drop a picture here
            <span className="text-xs">or tap to browse</span>
          </span>
        )}
        {upBusy && <span className="ui-spin-ring" aria-hidden />}
        {upBusy && (
          <span role="status" className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs text-white">
            Uploading…
          </span>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" disabled={upBusy} onClick={() => gallery.current?.click()} className="ui-btn-outline">
          <ImagePlus className="h-4 w-4" aria-hidden /> Choose from gallery
        </button>
        <button type="button" disabled={upBusy} onClick={() => camera.current?.click()} className="ui-btn-outline">
          <Camera className="h-4 w-4" aria-hidden /> Take a photo
        </button>
      </div>
    </div>,
    // 3 about
    <div key="s2" className="mx-auto w-full max-w-sm space-y-3">
      <label htmlFor="w-about" className="block text-sm text-muted">
        About
      </label>
      <input id="w-about" className="ui-field" maxLength={140} value={about} onChange={(e) => setAbout(e.target.value)} />
      <p className="text-right font-mono text-xs text-muted" aria-live="off">
        {about.length}/140
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Suggestions">
        {SUGGESTIONS.map((s, i) => (
          <button key={s} type="button" onClick={() => setAbout(s)} className="wz-chip rise" style={{ animationDelay: `${i * 40}ms` }}>
            {s}
          </button>
        ))}
      </div>
    </div>,
    // 4 theme
    <div key="s3" className="mx-auto w-full max-w-md">
      <ThemePicker value={theme} onChange={pickTheme} />
    </div>,
    // 5 accent
    <div key="s4" className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
      <AccentPicker value={accent} onChange={pickAccent} />
      <div className="glass flex w-full flex-wrap items-center justify-center gap-3 rounded-2xl p-4" aria-hidden>
        <span className="ui-btn pointer-events-none !px-5 !py-2.5 text-sm">Send message</span>
        <span className="ui-badge rounded-full px-2.5 py-0.5 text-xs font-semibold">3 unread</span>
        <span className="text-grad text-sm font-semibold">Link-C</span>
      </div>
    </div>,
    // 6 wallpaper
    <div key="s5" className="mx-auto w-full max-w-md">
      <WallpaperPicker
        kind={wKind}
        preset={wPreset}
        assetId={wAsset}
        dark={dark}
        busy={wBusy}
        onPreset={(id) => {
          setWPreset(id);
          setWKind('preset');
        }}
        onNone={() => setWKind('none')}
        onCustom={() => setWKind('custom')}
        onUpload={uploadWallpaper}
      />
    </div>,
    // 7 finish
    <div key="s6" className="relative mx-auto w-full max-w-sm">
      <dl className="glass ring-glow divide-y divide-line overflow-hidden rounded-2xl text-sm">
        {[
          ['name', shownName],
          ['about', about.trim() || DEFAULT_ABOUT],
          ['theme', themeLabel],
          ['wallpaper', wallpaperLabel],
        ].map(([k, v], i) => (
          <div key={k} className="rise flex items-baseline justify-between gap-4 px-4 py-2.5" style={{ animationDelay: `${i * 60}ms` }}>
            <dt className="font-mono text-xs text-muted">{k}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-main">{v}</dd>
          </div>
        ))}
        <div className="rise flex items-center justify-between gap-4 px-4 py-2.5" style={{ animationDelay: '240ms' }}>
          <dt className="font-mono text-xs text-muted">accent</dt>
          <dd>
            <span className="bg-grad block h-5 w-16 rounded-full" />
          </dd>
        </div>
      </dl>
    </div>,
  ];

  return (
    <div className="relative min-h-dvh">
      <MatrixRain intensity="subtle" />
      <main className="safe-top safe-bottom relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-stretch justify-center gap-5 px-4 py-6 lg:flex-row lg:items-center lg:gap-10">
        {/* live preview: on top on phones, on the side on desktop */}
        <aside className="shrink-0 lg:w-80" aria-label="Live preview">
          <p className="ui-step mb-2 hidden text-center lg:block" style={{ color: '#8fe9c4' }}>{'// live_preview'}</p>
          <div className="lg:hidden">
            <Preview userId={userId} name={shownName} about={about} assetId={avatar} localUrl={localUrl} theme={theme} wKind={wKind} wPreset={wPreset} wAsset={wAsset} dark={dark} compact />
          </div>
          <div className="hidden lg:block">
            <Preview userId={userId} name={shownName} about={about} assetId={avatar} localUrl={localUrl} theme={theme} wKind={wKind} wPreset={wPreset} wAsset={wAsset} dark={dark} />
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:max-w-xl" onKeyDown={onKeyDown}>
          <TerminalCard title={`~/profile/setup - step ${step + 1} of ${STEPS}`}>
            <div className="relative">
            <div className="space-y-5 p-5 sm:p-6">
              {/* glowing progress track with step dots */}
              <div className="px-1.5 pt-1">
                <div className="wz-track" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS}`}>
                  <div className="wz-fill" style={{ width: `${pct}%` }} />
                  {Array.from({ length: STEPS }, (_, i) => (
                    <span key={i} className="wz-dot" data-done={i < step} data-now={i === step} style={{ left: `${(i / (STEPS - 1)) * 100}%` }} />
                  ))}
                </div>
              </div>

              <div key={step} className={dir === 'fwd' ? 'wz-slide-fwd' : 'wz-slide-back'}>
                <div className="mb-5 space-y-2 text-center">
                  <StepLabel>{LABELS[step]}</StepLabel>
                  <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
                    {step === 0 || last ? <span className="text-grad">{HEADINGS[step][0]}</span> : HEADINGS[step][0]}
                  </h1>
                  <p className="mx-auto max-w-sm text-sm text-muted">{HEADINGS[step][1]}</p>
                </div>
                {stepBody[step]}
              </div>

              <div aria-live="polite" className="min-h-5 text-center text-sm">
                {error && (
                  <p role="alert" className="text-danger">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => go(step - 1)} disabled={step === 0 || busy} className={`ui-btn-ghost ${step === 0 ? 'invisible' : ''}`} aria-label="Back">
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Back
                </button>
                <div className="flex items-center gap-2">
                  {step >= 1 && step <= 5 && (
                    <button type="button" onClick={() => go(step + 1)} className="ui-btn-ghost">
                      Skip
                    </button>
                  )}
                  {last ? (
                    <button type="button" onClick={() => void finish()} disabled={busy} className="ui-btn min-w-36">
                      <Rocket className="h-4 w-4" aria-hidden /> {busy ? 'Saving…' : 'Finish'}
                    </button>
                  ) : (
                    <button type="button" onClick={onNext} disabled={(step === 0 && !nameOk) || upBusy || wBusy} className="ui-btn min-w-32">
                      Next <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {confetti && (
              <div className="pop glass absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl text-center" role="status">
                <svg className="wz-check h-16 w-16" viewBox="0 0 52 52" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="26" cy="26" r="23" opacity="0.4" />
                  <path d="M15 27l8 8 15-17" />
                </svg>
                <p className="text-grad text-2xl font-semibold">You are all set, {first}!</p>
                <p className="flex items-center gap-1 text-sm text-muted">
                  <Sparkles className="h-4 w-4" aria-hidden /> Taking you to your chats
                </p>
                {confetti.map((p) => (
                  <span
                    key={p.id}
                    aria-hidden
                    className="wz-confetti"
                    style={{ background: p.color, animationDelay: `${p.delay}ms`, ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px`, ['--rot' as string]: `${p.rot}deg` }}
                  />
                ))}
              </div>
            )}
            </div>
          </TerminalCard>
        </div>
      </main>

      <input ref={gallery} type="file" accept="image/*" className="hidden" aria-label="Choose a profile photo from your gallery" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void uploadAvatar(f); }} />
      <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" aria-label="Take a profile photo" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void uploadAvatar(f); }} />
    </div>
  );
}
