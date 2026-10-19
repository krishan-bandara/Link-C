'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room, RemoteTrack, LocalVideoTrack } from 'livekit-client';
import type { ChannelEvent } from './useConvChannel';

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected';
const RING_MS = 45_000;

type Send = (event: string, payload?: Record<string, unknown>) => void;

export function useCall(conversationId: string, send: Send) {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [video, setVideo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [remoteVideo, setRemoteVideo] = useState<RemoteTrack | null>(null);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const roomRef = useRef<Room | null>(null);
  const phaseRef = useRef<CallPhase>('idle');
  const ring = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const setP = useCallback((p: CallPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const cleanup = useCallback(
    (msg?: string) => {
      clearTimeout(ring.current);
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        room.removeAllListeners();
        void room.disconnect();
      }
      document.querySelectorAll('audio[data-linkc-call]').forEach((el) => el.remove());
      setRemoteVideo(null);
      setLocalVideo(null);
      setCamOn(false);
      setMicOn(true);
      setP('idle');
      setNotice(msg ?? null);
    },
    [setP],
  );

  const join = useCallback(
    async (withVideo: boolean) => {
      const res = await fetch('/api/calls/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; url?: string; error?: string };
      if (!res.ok || !data.token || !data.url) throw new Error(data.error ?? 'Could not start the call');
      const { Room, RoomEvent, Track } = await import('livekit-client');
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.setAttribute('data-linkc-call', '1');
          document.body.appendChild(el);
        } else setRemoteVideo(track);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
        if (track.kind === Track.Kind.Video) setRemoteVideo(null);
      });
      room.on(RoomEvent.ParticipantConnected, () => {
        clearTimeout(ring.current);
        setP('connected');
      });
      room.on(RoomEvent.ParticipantDisconnected, () => cleanup('Call ended'));
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) cleanup('Call ended');
      });
      await room.connect(data.url, data.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicOn(true);
      if (withVideo) {
        await room.localParticipant.setCameraEnabled(true);
        setLocalVideo((room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack) ?? null);
        setCamOn(true);
      }
      if (room.remoteParticipants.size > 0) setP('connected');
    },
    [conversationId, cleanup, setP],
  );

  const start = useCallback(
    async (withVideo: boolean) => {
      if (phaseRef.current !== 'idle') return;
      setNotice(null);
      setVideo(withVideo);
      setP('calling');
      try {
        await join(withVideo);
        sendRef.current('call-invite', { video: withVideo });
        ring.current = setTimeout(() => {
          sendRef.current('call-end');
          cleanup('No answer');
        }, RING_MS);
      } catch (e) {
        cleanup(e instanceof Error ? e.message : 'Could not start the call');
      }
    },
    [join, cleanup, setP],
  );

  const accept = useCallback(async () => {
    if (phaseRef.current !== 'ringing') return;
    clearTimeout(ring.current);
    setP('connecting');
    try {
      await join(video);
      sendRef.current('call-accept');
      setP('connected');
    } catch (e) {
      sendRef.current('call-decline');
      cleanup(e instanceof Error ? e.message : 'Could not join the call');
    }
  }, [join, video, cleanup, setP]);

  const decline = useCallback(() => {
    sendRef.current('call-decline');
    cleanup();
  }, [cleanup]);

  const hangup = useCallback(() => {
    sendRef.current('call-end');
    cleanup();
  }, [cleanup]);

  const onEvent = useCallback(
    (ev: ChannelEvent, payload: Record<string, unknown>) => {
      if (ev === 'call-invite') {
        if (phaseRef.current !== 'idle') return sendRef.current('call-decline');
        setNotice(null);
        setVideo(payload.video === true);
        setP('ringing');
        ring.current = setTimeout(() => cleanup('Missed call'), RING_MS);
      } else if (ev === 'call-accept') {
        clearTimeout(ring.current);
        if (phaseRef.current === 'calling') setP('connected');
      } else if (ev === 'call-decline') {
        if (phaseRef.current === 'calling') cleanup('Call declined');
      } else if (ev === 'call-end') {
        if (phaseRef.current !== 'idle') cleanup(phaseRef.current === 'ringing' ? 'Missed call' : 'Call ended');
      }
    },
    [cleanup, setP],
  );

  const toggleMic = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !micOn;
    await r.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !camOn;
    await r.localParticipant.setCameraEnabled(next);
    const { Track } = await import('livekit-client');
    setLocalVideo(next ? ((r.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack) ?? null) : null);
    setCamOn(next);
  }, [camOn]);

  // Cleanup on unmount (also tells the other side if a call was live).
  useEffect(
    () => () => {
      if (phaseRef.current !== 'idle') sendRef.current('call-end');
      cleanup();
    },
    [cleanup],
  );

  return { phase, video, notice, micOn, camOn, remoteVideo, localVideo, start, accept, decline, hangup, onEvent, toggleMic, toggleCam, clearNotice: () => setNotice(null) };
}
