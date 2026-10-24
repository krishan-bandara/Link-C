'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Lock, Mic, Send, Trash2 } from 'lucide-react';
import { buzz } from '@/lib/chat/haptics';
import { holdAlive } from '@/lib/idle-client';
import { classifySlide, formatDuration, makeVoiceFile, MAX_VOICE_SECONDS, MIN_VOICE_SECONDS, type Slide } from '@/lib/chat/voice';
import './voice.css';

type Phase = 'idle' | 'holding' | 'locked';
type Note = { text: string; error: boolean } | null;

function micError(e: unknown): string {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone is blocked. Allow it in your browser settings to send voice messages.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found on this device.';
  if (name === 'NotReadableError') return 'The microphone is busy in another app.';
  return 'Could not start recording.';
}

/** The mic button plus the recording bar that covers the composer row (the row must be position:relative). */
export default function VoiceRecorder({ mime, onVoice }: { mime: string; onVoice: (file: File, seconds: number) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [secs, setSecs] = useState(0);
  const [slide, setSlide] = useState<Slide>('none');
  const [note, setNote] = useState<Note>(null);

  const phaseRef = useRef<Phase>('idle');
  const busy = useRef(false); // true from press until everything is cleaned up: blocks a second recording
  const endIntent = useRef<null | 'send' | 'cancel'>(null); // released before the mic was ready
  const origin = useRef<{ x: number; y: number } | null>(null);
  const pointerId = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const raf = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const release = useRef<(() => void) | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>([]);
  const alive = useRef(true);
  const onVoiceRef = useRef(onVoice);
  onVoiceRef.current = onVoice;

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    if (alive.current) setPhase(p);
  };

  const showNote = useCallback((text: string, error = false) => {
    if (!alive.current) return;
    setNote({ text, error });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), error ? 6000 : 3000);
  }, []);

  /** Stop everything that holds the microphone or a timer. Safe to call many times. */
  const freeMedia = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    analyser.current = null;
    const c = ctx.current;
    ctx.current = null;
    if (c && c.state !== 'closed') void c.close().catch(() => undefined);
    release.current?.();
    release.current = null;
    document.removeEventListener('selectstart', blockSelect);
  }, []);

  const reset = useCallback(() => {
    freeMedia();
    recorder.current = null;
    chunks.current = [];
    origin.current = null;
    endIntent.current = null;
    levels.current = [];
    busy.current = false;
    phaseRef.current = 'idle';
    if (alive.current) {
      setPhase('idle');
      setSlide('none');
      setSecs(0);
    }
  }, [freeMedia]);

  /** Finish: send=true uploads it, send=false throws it away. */
  const finish = useCallback(
    (send: boolean) => {
      const rec = recorder.current;
      if (!rec) {
        // Still waiting for the microphone: remember what the user wanted.
        endIntent.current = send ? 'send' : 'cancel';
        return;
      }
      const elapsed = (Date.now() - startedAt.current) / 1000;
      const keep = send && elapsed >= MIN_VOICE_SECONDS;
      if (send && !keep) showNote('Hold to record');
      if (!keep) {
        rec.ondataavailable = null;
        rec.onstop = null;
        try {
          if (rec.state !== 'inactive') rec.stop();
        } catch {
          /* ignore */
        }
        reset();
        return;
      }
      const seconds = Math.min(MAX_VOICE_SECONDS, Math.max(1, Math.round(elapsed)));
      rec.onstop = () => {
        const file = makeVoiceFile(chunks.current, mime);
        reset();
        if (file.size > 0) onVoiceRef.current(file, seconds);
        else showNote('Nothing was recorded.', true);
      };
      try {
        if (rec.state !== 'inactive') rec.stop();
        else rec.onstop?.(new Event('stop'));
      } catch {
        reset();
        showNote('Could not finish the recording.', true);
      }
      // Release the mic right away; the data is flushed by onstop.
      stream.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(raf.current);
      if (tick.current) clearInterval(tick.current);
      tick.current = null;
    },
    [mime, reset, showNote],
  );

  function blockSelect(e: Event) {
    e.preventDefault();
  }

  const drawWave = useCallback(() => {
    const cv = canvas.current;
    const an = analyser.current;
    if (cv && an) {
      const buf = new Uint8Array(an.fftSize);
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      const lv = levels.current;
      lv.push(Math.min(1, peak / 90));
      const g = cv.getContext('2d');
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (g && w > 0) {
        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(w * dpr)) {
          cv.width = Math.round(w * dpr);
          cv.height = Math.round(h * dpr);
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        g.fillStyle = getComputedStyle(cv).getPropertyValue('--accent').trim() || '#007AFF';
        const step = 4;
        const n = Math.floor(w / step);
        if (lv.length > n) lv.splice(0, lv.length - n);
        for (let i = 0; i < lv.length; i++) {
          const bh = Math.max(3, lv[i]! * h);
          g.fillRect(w - (lv.length - i) * step, (h - bh) / 2, 2, bh);
        }
      }
    }
    raf.current = requestAnimationFrame(drawWave);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      showNote('Voice messages need a secure (https) connection and a microphone.', true);
      reset();
      return;
    }
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      showNote(micError(e), true);
      reset();
      return;
    }
    if (!alive.current || endIntent.current !== null || document.hidden) {
      const wasSend = endIntent.current === 'send';
      s.getTracks().forEach((t) => t.stop());
      reset();
      if (wasSend) showNote('Hold to record');
      return;
    }
    stream.current = s;
    release.current = holdAlive();
    document.addEventListener('selectstart', blockSelect);
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const c = new AC();
        ctx.current = c;
        const an = c.createAnalyser();
        an.fftSize = 256;
        c.createMediaStreamSource(s).connect(an);
        analyser.current = an;
      }
    } catch {
      /* the waveform is optional */
    }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(s, { mimeType: mime });
    } catch {
      freeMedia();
      showNote('This browser cannot record voice messages.', true);
      reset();
      return;
    }
    chunks.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.onerror = () => {
      rec.ondataavailable = null;
      rec.onstop = null;
      reset();
      showNote('Recording failed.', true);
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start(1000);
    buzz(15);
    raf.current = requestAnimationFrame(drawWave);
    tick.current = setInterval(() => {
      const el = (Date.now() - startedAt.current) / 1000;
      if (alive.current) setSecs(Math.floor(el));
      if (el >= MAX_VOICE_SECONDS) {
        showNote('5 minute limit reached, voice message sent.');
        buzz(30);
        finish(true);
      }
    }, 250);
  }, [mime, reset, showNote, freeMedia, drawWave, finish]);

  function onDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || busy.current) return;
    e.preventDefault();
    busy.current = true;
    endIntent.current = null;
    origin.current = { x: e.clientX, y: e.clientY };
    pointerId.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setNote(null);
    setSecs(0);
    setSlide('none');
    setPhaseBoth('holding');
    void start();
  }

  function onMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (phaseRef.current !== 'holding' || !origin.current || e.pointerId !== pointerId.current) return;
    const s = classifySlide(e.clientX - origin.current.x, e.clientY - origin.current.y);
    if (s === 'cancel') {
      buzz(25);
      setSlide('none');
      finish(false);
    } else if (s === 'lock') {
      buzz(20);
      setSlide('none');
      setPhaseBoth('locked');
    } else {
      setSlide((cur) => (cur === s ? cur : s));
    }
  }

  function onUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (phaseRef.current === 'holding') finish(e.type === 'pointerup');
  }

  // Keyboard users: Enter or Space starts a locked recording (a real pointer click has detail >= 1).
  function onKeyClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (e.detail !== 0 || busy.current) return;
    busy.current = true;
    endIntent.current = null;
    setNote(null);
    setSecs(0);
    setPhaseBoth('locked');
    void start();
  }

  // Page hidden: discard. Unmount: free everything without touching state.
  useEffect(() => {
    alive.current = true;
    const hide = () => {
      if (document.hidden && busy.current) {
        if (recorder.current) finish(false);
        else endIntent.current = 'cancel';
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', hide);
      if (noteTimer.current) clearTimeout(noteTimer.current);
      const rec = recorder.current;
      if (rec) {
        rec.ondataavailable = null;
        rec.onstop = null;
        try {
          if (rec.state !== 'inactive') rec.stop();
        } catch {
          /* ignore */
        }
      }
      recorder.current = null;
      endIntent.current = 'cancel';
      freeMedia();
    };
  }, [finish, freeMedia]);

  const recording = phase !== 'idle';
  const locked = phase === 'locked';
  const hot = slide === 'cancel';

  return (
    <>
      {note && (
        <p className="vr-note" role={note.error ? 'alert' : 'status'} data-error={note.error}>
          {note.text}
        </p>
      )}
      {recording && (
        <div className="vr-bar" data-locked={locked} onContextMenu={(e) => e.preventDefault()}>
          <span className="vr-sr" role="status">
            Recording voice message
          </span>
          {locked && (
            <button type="button" className="vr-btn" aria-label="Cancel recording" onClick={() => finish(false)}>
              <Trash2 className="h-5 w-5 text-danger" aria-hidden />
            </button>
          )}
          <span className="vr-dot" aria-hidden />
          <span className="vr-time" aria-hidden>
            {formatDuration(secs)}
          </span>
          <canvas ref={canvas} className="vr-wave" aria-hidden />
          {!locked && (
            <span className="vr-hint" data-hot={hot} aria-hidden>
              <ChevronLeft className="mr-0.5 inline h-4 w-4" aria-hidden />
              Slide to cancel
            </span>
          )}
          {locked && (
            <button type="button" className="vr-btn vr-send" aria-label="Send voice message" onClick={() => finish(true)}>
              <Send className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      )}
      {phase === 'holding' && (
        <span className="vr-lockhint" data-hot={slide === 'lock'} aria-hidden>
          <Lock className="h-4 w-4" />
        </span>
      )}
      <button
        type="button"
        className="vr-mic mb-0.5 flex shrink-0 items-center justify-center rounded-full text-accent-ink"
        data-held={phase === 'holding'}
        aria-label="Record voice message"
        aria-hidden={locked}
        tabIndex={locked ? -1 : 0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onKeyClick}
        style={{ position: 'relative', zIndex: phase === 'holding' ? 20 : undefined }}
      >
        <Mic className="h-5 w-5" aria-hidden />
      </button>
    </>
  );
}
