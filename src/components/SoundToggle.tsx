'use client';

import { useEffect, useState } from 'react';
import { playPreview, setSoundEnabled, setSoundVolume, soundEnabled, soundVolume } from '@/lib/sound';

/** Message sounds for THIS device: on/off, volume and a test button. */
export default function SoundToggle() {
  const [on, setOn] = useState(true);
  const [vol, setVol] = useState(0.6);
  useEffect(() => {
    setOn(soundEnabled());
    setVol(soundVolume());
  }, []);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p id="snd-label" className="font-medium">
            Message sounds
          </p>
          <p id="snd-desc" className="text-sm text-muted">
            A short tone when a message arrives and when you send one. Saved on this device only.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="snd-label"
          aria-describedby="snd-desc"
          onClick={() => {
            const v = !on;
            setOn(v);
            setSoundEnabled(v);
          }}
          className="ui-switch mt-1"
        >
          <span />
        </button>
      </div>
      {on && (
        <div className="flex items-center gap-3">
          <label htmlFor="snd-vol" className="text-sm text-muted">
            Volume
          </label>
          <input
            id="snd-vol"
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(vol * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setVol(v);
              setSoundVolume(v);
            }}
            className="min-w-0 flex-1 accent-[var(--accent)]"
          />
          <button type="button" onClick={playPreview} className="ui-btn-outline !px-3 !py-1.5 text-sm">
            Test
          </button>
        </div>
      )}
    </div>
  );
}
