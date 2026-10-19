'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import Avatar from './Avatar';

/**
 * Profile picture chooser: gallery or camera (capture=user). Shows a local preview right away;
 * the parent uploads in onFile and resolves true when the upload worked.
 */
export default function PhotoPicker({
  userId,
  name,
  assetId,
  size = 120,
  onFile,
  onRemove,
}: {
  userId: string;
  name: string;
  assetId: string | null;
  size?: number;
  onFile: (file: File) => Promise<boolean>;
  onRemove?: () => Promise<void> | void;
}) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setPreview(URL.createObjectURL(f));
    const ok = await onFile(f);
    if (!ok) setPreview(null);
    setBusy(false);
  }
  const input = (ref: React.RefObject<HTMLInputElement | null>, label: string, capture?: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(capture ? { capture: 'user' as const } : {})}
      className="hidden"
      aria-label={label}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        void pick(f);
      }}
    />
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size + 8, height: size + 8 }}>
        <div className="ui-avatar-ring">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your new profile picture" style={{ width: size, height: size }} className="block rounded-full border-2 border-app object-cover" />
          ) : (
            <Avatar key={assetId ?? 'none'} userId={userId} name={name} assetId={assetId} size={size} className="border-2 border-app" />
          )}
        </div>
        {busy && <span className="ui-spin-ring" aria-hidden />}
        {busy && (
          <span role="status" className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-xs text-white">
            Uploading…
          </span>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" disabled={busy} onClick={() => gallery.current?.click()} className="ui-btn-outline">
          <ImagePlus className="h-4 w-4" aria-hidden /> Choose photo
        </button>
        <button type="button" disabled={busy} onClick={() => camera.current?.click()} className="ui-btn-outline">
          <Camera className="h-4 w-4" aria-hidden /> Take photo
        </button>
        {onRemove && (assetId || preview) && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onRemove();
              setPreview(null);
              setBusy(false);
            }}
            className="ui-btn-outline !text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Remove
          </button>
        )}
      </div>
      {input(gallery, 'Choose a profile photo from your gallery')}
      {input(camera, 'Take a profile photo', true)}
    </div>
  );
}
