'use client';

// Short UI sounds made with the Web Audio API: no sound files, so nothing to license or download.
// The on/off choice and volume are kept per device in localStorage (a phone and a laptop can differ).

const KEY_ON = 'lc-sound';
const KEY_VOL = 'lc-sound-vol';

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY_ON) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY_ON, on ? 'on' : 'off');
  } catch {
    /* storage blocked: the choice just does not stick */
  }
}

export function soundVolume(): number {
  try {
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.6;
  } catch {
    return 0.6;
  }
}

export function setSoundVolume(v: number): void {
  try {
    localStorage.setItem(KEY_VOL, String(Math.min(1, Math.max(0.1, v))));
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Browsers keep audio locked until a tap or key press. Call once at startup; the first interaction unlocks it. */
export function unlockAudioOnFirstTouch(): () => void {
  const unlock = () => {
    audio();
    if (ctx?.state === 'running') off();
  };
  const evs = ['pointerdown', 'keydown', 'touchstart'] as const;
  const off = () => evs.forEach((e) => window.removeEventListener(e, unlock, true));
  evs.forEach((e) => window.addEventListener(e, unlock, true));
  return off;
}

type Note = { f: number; at: number; dur: number; gain?: number };

function play(notes: Note[], force = false): void {
  if (!force && !soundEnabled()) return;
  const a = audio();
  if (!a || a.state !== 'running') return; // browsers keep audio locked until the person has tapped or typed once
  const vol = soundVolume();
  const t0 = a.currentTime;
  for (const n of notes) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.f;
    const peak = (n.gain ?? 0.25) * vol;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

/** A message arrived while you are in another chat or the tab is in the background. */
export const playReceive = () =>
  play([
    { f: 880, at: 0, dur: 0.18 },
    { f: 1318.5, at: 0.11, dur: 0.28 },
  ]);

/** A message arrived in the chat you are looking at: quieter and shorter. */
export const playInChat = () => play([{ f: 1046.5, at: 0, dur: 0.12, gain: 0.14 }]);

/** Your own message was sent. */
export const playSent = () => play([{ f: 659.3, at: 0, dur: 0.09, gain: 0.12 }, { f: 880, at: 0.06, dur: 0.1, gain: 0.1 }]);

/** Plays whatever the current settings allow, ignoring the on/off switch (for the Settings "Test sound" button). */
export const playPreview = () => {
  play(
    [
      { f: 880, at: 0, dur: 0.18 },
      { f: 1318.5, at: 0.11, dur: 0.28 },
    ],
    true,
  );
};
