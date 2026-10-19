'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import type { Track } from 'livekit-client';
import type { useCall } from '@/lib/chat/useCall';
import { holdAlive } from '@/lib/idle-client';
import Avatar from '@/components/ui/Avatar';
import { buzz } from '@/lib/chat/haptics';
import { FOCUS } from './ui';
import './chat.css';

type Call = ReturnType<typeof useCall>;

function TrackView({ track, className, muted }: { track: Track | null; className: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  if (!track) return null;
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function Timer() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</>;
}

export default function CallOverlay({
  call,
  name,
  userId,
  avatarAssetId = null,
}: {
  call: Call;
  name: string;
  userId?: string;
  avatarAssetId?: string | null;
}) {
  const { phase } = call;
  const inCall = phase !== 'idle';
  useEffect(() => (inCall ? holdAlive() : undefined), [inCall]); // a running call is activity
  useEffect(() => {
    if (phase === 'ringing') buzz(40);
  }, [phase]);
  if (phase === 'idle') return null;
  const incoming = phase === 'ringing';
  const waiting = phase === 'calling' || phase === 'ringing' || phase === 'connecting';
  const status =
    phase === 'calling' ? 'Calling...' : phase === 'ringing' ? `Incoming ${call.video ? 'video' : 'voice'} call` : phase === 'connecting' ? 'Connecting...' : null;
  const round = 'flex items-center justify-center rounded-full transition-transform active:scale-90 hover:scale-105 disabled:opacity-50';
  const glass = `cv-glassbtn ${round} h-14 w-14 text-white ${FOCUS}`;
  const off = `${round} h-14 w-14 bg-white text-[#070b14] ${FOCUS}`;

  return (
    <div className="cv-call safe-top safe-bottom fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Call">
      <div className="relative min-h-0 flex-1">
        <TrackView track={call.remoteVideo} className="h-full w-full bg-black object-cover" />
        {!call.remoteVideo && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="relative h-28 w-28">
              {waiting && (
                <>
                  <span className="cv-call-ring" aria-hidden />
                  <span className="cv-call-ring" aria-hidden />
                  <span className="cv-call-ring" aria-hidden />
                </>
              )}
              <div className="relative rounded-full p-1 bg-grad shadow-[0_0_40px_-6px_var(--accent)]">
                {userId ? (
                  <Avatar userId={userId} name={name} assetId={avatarAssetId} size={104} className="border-2 border-[#070b14]" />
                ) : (
                  <span className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-[#101a30] text-4xl font-semibold text-white">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent p-5 text-center">
          <p className="text-xl font-semibold drop-shadow">{name}</p>
          <p className={`text-sm drop-shadow ${waiting ? 'text-grad' : 'text-white/80'}`} aria-live="polite">
            {status ?? <Timer />}
          </p>
        </div>
        {call.localVideo && (
          <TrackView
            track={call.localVideo}
            muted
            className="absolute bottom-3 right-3 h-36 w-24 -scale-x-100 rounded-2xl border border-white/20 bg-black object-cover shadow-xl"
          />
        )}
      </div>
      <div className="flex items-center justify-center gap-5 p-6">
        {incoming ? (
          <>
            <button type="button" onClick={call.decline} className={`${round} h-16 w-16 bg-danger text-white shadow-lg ${FOCUS}`} aria-label="Decline">
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              type="button"
              onClick={() => void call.accept()}
              className={`${round} h-16 w-16 bg-grad text-accent-ink shadow-[0_0_30px_-4px_var(--accent)] ${FOCUS}`}
              aria-label="Accept"
              autoFocus
            >
              <Phone className="h-7 w-7" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void call.toggleMic()}
              disabled={phase === 'connecting'}
              className={call.micOn ? glass : off}
              aria-label={call.micOn ? 'Mute' : 'Unmute'}
              aria-pressed={!call.micOn}
            >
              {call.micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
            </button>
            <button
              type="button"
              onClick={() => void call.toggleCam()}
              disabled={phase === 'connecting'}
              className={call.camOn ? glass : off}
              aria-label={call.camOn ? 'Turn camera off' : 'Turn camera on'}
              aria-pressed={!call.camOn}
            >
              {call.camOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
            </button>
            <button type="button" onClick={call.hangup} className={`${round} h-14 w-14 bg-danger text-white shadow-lg ${FOCUS}`} aria-label="Hang up" autoFocus>
              <PhoneOff className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
