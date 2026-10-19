'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type CSSProperties } from 'react';
import { createPack, removePack, removeSticker } from '../actions';
import { EmptyState, Icon, btnCls, btnDangerCls, btnGhostCls, inputCls } from '../kit';
import { ActionForm, Field, Submit } from '../ui';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 30;
const EXT = /\.(jpe?g|png|webp|gif)$/i;

type StickerView = { id: string; emoji: string | null };
export type PackView = { id: string; name: string; stickers: StickerView[] };

function CreatePackCard() {
  return (
    <li className="rise">
      <ActionForm action={createPack} className="ad-card ad-newpack h-full" reset>
        <h2 className="ad-card-title">
          <Icon name="plus" size={18} /> New pack
        </h2>
        <Field label="Pack name" hint="1 to 40 characters">
          <input name="name" required maxLength={40} autoComplete="off" className={inputCls} />
        </Field>
        <Submit className={btnCls}>Create pack</Submit>
      </ActionForm>
    </li>
  );
}

type Item = { key: number; file: File | null; name: string; state: 'queued' | 'uploading' | 'done' | 'error'; message?: string };

function UploadZone({ packId }: { packId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [emoji, setEmoji] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  function add(list: FileList | File[]) {
    const incoming = Array.from(list);
    setItems((cur) => {
      const room = MAX_FILES - cur.filter((i) => i.state === 'queued').length;
      const next: Item[] = [];
      incoming.forEach((f, idx) => {
        const key = ++seq.current;
        if (idx >= room) next.push({ key, file: null, name: f.name, state: 'error', message: `At most ${MAX_FILES} images at a time` });
        else if (!EXT.test(f.name)) next.push({ key, file: null, name: f.name, state: 'error', message: 'Not a jpeg, png, webp or gif file' });
        else if (f.size > MAX_BYTES) next.push({ key, file: null, name: f.name, state: 'error', message: 'Larger than 4 MB' });
        else next.push({ key, file: f, name: f.name, state: 'queued' });
      });
      return [...cur.filter((i) => i.state !== 'done' && i.state !== 'error'), ...next];
    });
    if (inputRef.current) inputRef.current.value = '';
  }

  async function upload() {
    const queue = items.filter((i) => i.state === 'queued' && i.file);
    if (!queue.length) return;
    setBusy(true);
    const patch = (key: number, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));
    for (const it of queue) {
      patch(it.key, { state: 'uploading' });
      try {
        const qs = new URLSearchParams({ packId });
        if (emoji.trim()) qs.set('emoji', emoji.trim());
        const res = await fetch(`/api/admin/stickers?${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': it.file!.type || 'application/octet-stream' },
          body: it.file,
        });
        if (res.ok) patch(it.key, { state: 'done', file: null });
        else {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          patch(it.key, { state: 'error', message: j?.error ?? `Failed (${res.status})` });
        }
      } catch {
        patch(it.key, { state: 'error', message: 'Network error' });
      }
    }
    setBusy(false);
    router.refresh();
  }

  const queued = items.filter((i) => i.state === 'queued').length;
  const added = items.filter((i) => i.state === 'done').length;

  return (
    <div className="space-y-3">
      <label
        className="ad-drop"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) add(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={28} />
        <b>Drop images here or click to choose</b>
        <span className="text-xs text-muted">Add images: up to {MAX_FILES} files, 4 MB each (jpeg, png, webp, gif)</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={busy}
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-label="Add images"
          onChange={(e) => e.target.files && add(e.target.files)}
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="Emoji label" hint="Optional">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={16} className={inputCls} />
          </Field>
        </div>
        <button type="button" className={btnCls} disabled={busy || queued === 0} onClick={upload}>
          <Icon name="upload" size={16} /> {busy ? 'Uploading...' : queued ? `Upload ${queued} image${queued === 1 ? '' : 's'}` : 'Upload'}
        </button>
        {items.length > 0 && !busy && (
          <button type="button" className={btnGhostCls} onClick={() => setItems([])}>
            Clear list
          </button>
        )}
      </div>
      {items.length > 0 && (
        <ul className="ad-fchips" aria-label="Files">
          {items.map((i) => (
            <li key={i.key} className="ad-fchip" data-s={i.state}>
              <Icon name={i.state === 'done' ? 'check' : i.state === 'error' ? 'alert' : 'image'} size={15} />
              <span className="n">{i.name}</span>
              <span className={i.state === 'error' ? 'text-danger' : 'text-muted'}>
                {i.state === 'queued' ? 'Ready' : i.state === 'uploading' ? 'Uploading...' : i.state === 'done' ? 'Added' : i.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div aria-live="polite" className="empty:hidden">
        {!busy && added > 0 && (
          <p role="status" className="text-sm text-accent">
            {added} sticker{added === 1 ? '' : 's'} added.
          </p>
        )}
      </div>
    </div>
  );
}

function Mosaic({ stickers }: { stickers: StickerView[] }) {
  return (
    <div className="ad-mosaic" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i}>
          {stickers[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/stickers/${stickers[i].id}/image`} alt="" loading="lazy" />
          ) : (
            <Icon name="image" size={18} className="text-muted" />
          )}
        </span>
      ))}
    </div>
  );
}

export function PacksBrowser({ packs }: { packs: PackView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = packs.find((p) => p.id === openId) ?? null;

  if (open) {
    return (
      <section className="space-y-5" aria-label={`Pack ${open.name}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className={`${btnGhostCls} ad-back`} onClick={() => setOpenId(null)}>
              <Icon name="chevronLeft" size={16} /> All packs
            </button>
            <h2 className="ad-h2 min-w-0 truncate">
              {open.name} <small>{open.stickers.length} stickers</small>
            </h2>
          </div>
          <ActionForm action={removePack} danger confirmLabel="Delete pack" confirm={`Delete the pack "${open.name}" and all its stickers? This cannot be undone.`}>
            <input type="hidden" name="packId" value={open.id} />
            <Submit className={btnDangerCls}>
              <Icon name="trash" size={15} /> Delete pack
            </Submit>
          </ActionForm>
        </div>

        {open.stickers.length > 0 ? (
          <ul className="ad-tiles">
            {open.stickers.map((s, i) => (
              <li key={s.id} className="ad-tile rise" style={{ animationDelay: `${Math.min(i, 15) * 30}ms` } as CSSProperties}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/stickers/${s.id}/image`} alt={s.emoji ? `Sticker ${s.emoji}` : 'Sticker'} loading="lazy" />
                {s.emoji && <span className="ad-tile-emoji">{s.emoji}</span>}
                <span className="ad-tile-del">
                  <ActionForm action={removeSticker} danger confirmLabel="Delete" confirm="Delete this sticker?">
                    <input type="hidden" name="stickerId" value={s.id} />
                    <Submit className={`${btnDangerCls} ad-btn-sm ad-btn-icon bg-panel`} aria-label="Delete sticker" title="Delete">
                      <Icon name="trash" size={15} />
                    </Submit>
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="smile" title="No stickers in this pack yet" text="Drop some images below to add them." />
        )}

        <div className="ad-card">
          <h3 className="ad-card-title mb-3">
            <Icon name="upload" size={18} /> Add stickers
          </h3>
          <UploadZone packId={open.id} />
        </div>
      </section>
    );
  }

  return (
    <ul className="ad-pgrid ad-pgrid-packs">
      <CreatePackCard />
      {packs.map((p, i) => (
        <li key={p.id} className="rise" style={{ animationDelay: `${Math.min(i + 1, 12) * 45}ms` } as CSSProperties}>
          <button type="button" className="ad-card ad-lift ad-pack" onClick={() => setOpenId(p.id)} aria-label={`Open pack ${p.name}, ${p.stickers.length} stickers`}>
            <Mosaic stickers={p.stickers} />
            <span className="min-w-0">
              <span className="ad-pack-name block">{p.name}</span>
              <span className="ad-pack-count">
                {p.stickers.length} sticker{p.stickers.length === 1 ? '' : 's'}
              </span>
            </span>
          </button>
        </li>
      ))}
      {packs.length === 0 && <EmptyState icon="smile" title="No packs yet" text="Create the first one with the card above." />}
    </ul>
  );
}
