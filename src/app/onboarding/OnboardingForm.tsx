'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Database, Lock, MapPin, MessageSquareText, ShieldCheck, Timer, Flame } from 'lucide-react';
import SkyBackground from '@/components/auth/SkyBackground';
import TerminalCard, { StepLabel } from '@/components/auth/TerminalCard';
import '@/components/ui/ui.css';

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: (data as { error?: string }).error };
}

const POINTS: { icon: typeof Lock; text: string }[] = [
  {
    icon: Lock,
    text: 'Messages and files are encrypted on the server. This is not end-to-end encryption, so the person who runs this server could technically access them.',
  },
  {
    icon: Flame,
    text: 'Snaps are deleted after they are viewed, but the person who receives one could still screenshot or film it.',
  },
  { icon: MapPin, text: 'Your location is only shared when you explicitly agree, each time.' },
  { icon: Timer, text: 'Messages are kept until someone deletes them.' },
  {
    icon: Database,
    text: 'We store your email, display name, your messages and files (encrypted), and, if you gave one, your phone number, if you gave one (stored as plain text in the database and used only to text you alerts).',
  },
];

export default function OnboardingForm({
  initialName,
  maskedPhone,
  alreadyVerified,
}: {
  initialName: string;
  maskedPhone: string | null;
  alreadyVerified: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(alreadyVerified);
  const [phoneMsg, setPhoneMsg] = useState('');

  async function sendCode() {
    setPhoneMsg('');
    const r = await post('/api/phone/send');
    if (r.ok) {
      setCodeSent(true);
      setPhoneMsg('Code sent.');
    } else setPhoneMsg(r.error ?? 'Could not send the code right now');
  }

  async function verifyCode() {
    setPhoneMsg('');
    const r = await post('/api/phone/verify', { code });
    if (r.ok) {
      setVerified(true);
      setPhoneMsg('');
    } else setPhoneMsg(r.error ?? 'That code did not work');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted || busy) return;
    setBusy(true);
    setError('');
    const trimmed = name.trim();
    const r = await post('/api/onboarding/accept', trimmed ? { displayName: trimmed } : {});
    if (!r.ok) {
      setError(r.error ?? 'Something went wrong');
      setBusy(false);
      return;
    }
    router.replace('/welcome');
    router.refresh();
  }

  return (
    <div className="relative min-h-dvh">
      <SkyBackground intensity="subtle" />
      <main className="safe-top safe-bottom relative z-10 mx-auto flex min-h-dvh w-full max-w-xl items-center px-3 py-6 sm:px-4 sm:py-8">
        <div className="w-full">
          <TerminalCard title="~/onboarding/notice - read me">
            <form onSubmit={submit} className="space-y-6">
              <header className="rise space-y-2">
                <StepLabel>read(privacy_notice)</StepLabel>
                <h1 className="text-3xl font-semibold">
                  Welcome to <span className="text-grad">Link-C</span>
                </h1>
              </header>

              <section className="rise space-y-3" style={{ animationDelay: '80ms' }} aria-labelledby="ob-privacy">
                <h2 id="ob-privacy" className="flex items-center gap-2 text-base font-semibold text-main">
                  <ShieldCheck className="h-5 w-5 text-accent" aria-hidden /> How your privacy works
                </h2>
                <ul className="space-y-2.5 text-sm text-muted">
                  {POINTS.map(({ icon: Icon, text }, i) => (
                    <li key={i} className="rise glass flex gap-3 rounded-xl p-3" style={{ animationDelay: `${140 + i * 60}ms` }}>
                      <span className="bg-grad flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-accent-ink">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">{text}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rise glass space-y-2 rounded-xl p-4 text-sm text-muted" style={{ animationDelay: '460ms' }} aria-labelledby="ob-sms">
                <h2 id="ob-sms" className="flex items-center gap-2 text-base font-semibold text-main">
                  <MessageSquareText className="h-5 w-5 text-accent" aria-hidden /> Text message alerts
                </h2>
                <p>
                  Alerts look like an ordinary system message and do not mention the app. At most 3 are sent per day, only
                  when you are offline and have unread messages. You can turn them on or off at any time in Settings.
                </p>
                {maskedPhone && (
                  <div className="space-y-2 pt-2">
                    <p>
                      Number on file: <span className="break-all font-mono text-main">{maskedPhone}</span>
                    </p>
                    {verified ? (
                      <p className="pop flex items-center gap-1.5 font-medium text-accent">
                        <BadgeCheck className="h-4 w-4" aria-hidden /> Number verified.
                      </p>
                    ) : (
                      <>
                        <p className="text-muted">Verifying is optional. Alerts are sent to this number either way.</p>
                        <button type="button" onClick={sendCode} className="ui-btn-outline w-full">
                          {codeSent ? 'Send a new code' : 'Send me a code'}
                        </button>
                        {codeSent && (
                          <div className="flex items-stretch gap-2">
                            <input
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              aria-label="6-digit code"
                              className="ui-field min-w-0 flex-1 font-mono tracking-widest"
                              value={code}
                              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="6-digit code"
                            />
                            <button type="button" onClick={verifyCode} disabled={code.length !== 6} className="ui-btn shrink-0 !px-4">
                              Verify
                            </button>
                          </div>
                        )}
                        <p role="status" aria-live="polite" className="min-h-5 break-words text-muted">
                          {phoneMsg}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </section>

              <div className="rise space-y-2" style={{ animationDelay: '520ms' }}>
                <label htmlFor="name" className="block text-sm text-muted">
                  Display name (optional)
                </label>
                <input id="name" className="ui-field" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="How others see you" />
              </div>

              <label className="rise flex cursor-pointer items-start gap-3 text-sm" style={{ animationDelay: '580ms' }}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--accent)]" />
                <span className="min-w-0 py-1">I have read and accept</span>
              </label>

              <p role="alert" className="min-h-5 text-sm text-danger">
                {error}
              </p>
              <button className="ui-btn w-full" disabled={!accepted || busy}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            </form>
          </TerminalCard>
        </div>
      </main>
    </div>
  );
}
