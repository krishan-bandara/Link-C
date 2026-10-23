'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatDuration } from '@/lib/chat/voice';
import './voice.css';

/** Only one voice message plays at a time: the one playing registers its pause function here. */
let activePause: (() => void) | null = null;

const SPEEDS = [1, 1.5, 2] as const;

export default function AudioPlayer({ src, mine, durationHint }: { src: string; mine: boolean; durationHint?: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState<number | null>(durationHint && durationHint > 0 ? durationHint : null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [failed, setFailed] = useState(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    audioRef.current = a;
    let probing = false;
    const hasHint = !!durationHint && durationHint > 0;
    const pauseSelf = () => a.pause();

    const readDuration = () => {
      const d = a.duration;
      if (Number.isFinite(d) && d > 0) {
        setDur(d);
        if (probing) {
          probing = false;
          try {
            a.currentTime = 0;
          } catch {
            /* ignore */
          }
          setCur(0);
        }
      } else if (!hasHint && !probing && d === Infinity) {
        // MediaRecorder WebM has no length in its header: seeking far past the end makes the browser find it.
        probing = true;
        try {
          a.currentTime = 1e101;
        } catch {
          probing = false;
        }
      }
    };
    const onTime = () => {
      if (probing) readDuration();
      else setCur(a.currentTime);
    };
    const onPlay = () => {
      if (activePause && activePause !== pauseSelf) activePause();
      activePause = pauseSelf;
      a.playbackRate = speedRef.current;
      setPlaying(true);
    };
    const onPause = () => {
      setPlaying(false);
      if (activePause === pauseSelf) activePause = null;
    };
    const onEnded = () => {
      setPlaying(false);
      setDur((d) => d ?? (Number.isFinite(a.currentTime) && a.currentTime > 0 ? a.currentTime : d));
      setCur(0);
      try {
        a.currentTime = 0;
      } catch {
        /* ignore */
      }
      if (activePause === pauseSelf) activePause = null;
    };
    const onError = () => {
      setFailed(true);
      setPlaying(false);
    };

    a.addEventListener('loadedmetadata', readDuration);
    a.addEventListener('durationchange', readDuration);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);
    setFailed(false);
    a.src = src;

    return () => {
      a.pause();
      if (activePause === pauseSelf) activePause = null;
      a.removeEventListener('loadedmetadata', readDuration);
      a.removeEventListener('durationchange', readDuration);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
      a.removeAttribute('src');
      a.load();
      audioRef.current = null;
    };
  }, [src, durationHint]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    a.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setFailed(true);
    });
  }

  function seek(v: number) {
    const a = audioRef.current;
    if (!a || !Number.isFinite(v)) return;
    try {
      a.currentTime = v;
    } catch {
      /* ignore */
    }
    setCur(v);
  }

  const known = dur !== null && dur > 0;
  const pct = known ? Math.min(100, (cur / dur) * 100) : 0;
  const time = known ? `${formatDuration(cur)} / ${formatDuration(dur)}` : formatDuration(cur);

  if (failed) {
    return (
      <p className="ap-err" role="alert">
        Could not play this voice message
      </p>
    );
  }

  return (
    <div className="ap" data-mine={mine}>
      <button type="button" className="ap-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
      </button>
      <div className="ap-mid">
        <input
          type="range"
          className="ap-seek"
          aria-label="Seek"
          aria-valuetext={time}
          min={0}
          max={known ? dur : 1}
          step={0.1}
          value={known ? Math.min(cur, dur) : 0}
          disabled={!known}
          style={{ ['--p' as string]: `${pct}%` }}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="ap-time">{time}</span>
      </div>
      <button
        type="button"
        className="ap-chip"
        aria-label={`Playback speed ${speed}x, tap to change`}
        onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!)}
      >
        {speed}x
      </button>
    </div>
  );
}
