import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { decryptRange, encryptFile, newFileKey, unwrapKey, wrapKey } from '@/lib/crypto';
import { HttpError } from '@/lib/errors';
import { dataDir, mediaStore, storeFor } from '@/lib/storage';
import { adminClient } from '@/lib/supabase/admin';

export type AssetKind = 'avatar' | 'wallpaper' | 'sticker' | 'chat_wallpaper';
export const MAX_BYTES: Record<AssetKind, number> = { avatar: 8 << 20, wallpaper: 8 << 20, sticker: 4 << 20, chat_wallpaper: 8 << 20 };
export const MAX_OWN_STICKERS = 100;
const INPUT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ---------------------------------------------------------------- pure helpers

/** Reads the request body with a hard cap. Checks content-length first, then counts streamed bytes. */
export async function readBodyCapped(req: Request, max: number): Promise<Buffer> {
  const declared = req.headers.get('content-length');
  if (declared && Number(declared) > max) throw new HttpError(413, 'File is too large');
  if (!req.body) throw new HttpError(400, 'Empty body');
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = req.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) throw new HttpError(413, 'File is too large');
      chunks.push(Buffer.from(value));
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  if (total === 0) throw new HttpError(400, 'Empty body');
  return Buffer.concat(chunks);
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
};
export const extForMime = (mime: string): string => EXT[mime] ?? 'bin';

/** Download filename: link-c-<first 8 chars of id>.<ext>. The id must already be a validated uuid. */
export const downloadName = (id: string, mime: string) => `link-c-${id.slice(0, 8)}.${extForMime(mime)}`;

/** Optional sticker label: a single emoji or short text, max 16 code points, no control characters. */
export function parseEmoji(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if ([...s].length > 16 || /\p{Cc}/u.test(s)) throw new HttpError(400, 'Invalid emoji');
  return s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Optional `conversation` query parameter: null when absent, 400 when present but not a uuid. */
export function parseConversationParam(url: string): string | null {
  const v = new URL(url).searchParams.get('conversation');
  if (v === null || v === '') return null;
  if (!UUID_RE.test(v)) throw new HttpError(400, 'Invalid conversation');
  return v.toLowerCase();
}

/** 404 unless the person takes part in the conversation (checked server side, not from the client's word). */
export async function requireParticipant(userId: string, conversationId: string): Promise<void> {
  const { data } = await adminClient()
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .maybeSingle();
  if (!data) throw new HttpError(404, 'Not found');
}

// ---------------------------------------------------------------- storing and reading

export async function normalise(kind: AssetKind, input: Buffer): Promise<{ data: Buffer; mime: string }> {
  const ft = await fileTypeFromBuffer(input);
  if (!ft || !INPUT_MIMES.includes(ft.mime)) throw new HttpError(415, 'Use a JPEG, PNG, WebP or GIF image');
  try {
    // sharp drops all metadata by default; animation is kept for stickers only (first frame for everything else).
    if (kind === 'sticker' && (ft.mime === 'image/webp' || ft.mime === 'image/gif')) {
      const meta = await sharp(input, { animated: true, limitInputPixels: 40_000_000 }).metadata();
      if ((meta.pages ?? 1) > 1) {
        // frames cap keeps a crafted file from eating memory; small frames keep chat light
        if ((meta.pages ?? 1) > 300) throw new HttpError(415, 'This animation has too many frames');
        const anim = await sharp(input, { animated: true, limitInputPixels: 40_000_000 })
          .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 70, effort: 4 })
          .toBuffer();
        if (anim.length > 2 * 1024 * 1024) throw new HttpError(413, 'This animation is too large');
        return { data: anim, mime: 'image/webp' };
      }
    }
    const img = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
    if (kind === 'avatar') {
      return { data: await img.resize(384, 384, { fit: 'cover' }).webp({ quality: 85 }).toBuffer(), mime: 'image/webp' };
    }
    if (kind === 'wallpaper' || kind === 'chat_wallpaper') {
      const data = await img
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();
      return { data, mime: 'image/jpeg' };
    }
    const data = await img
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer();
    return { data, mime: 'image/webp' };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(415, 'This image could not be read');
  }
}

export async function storeAsset(a: { ownerId: string; kind: AssetKind; buffer: Buffer }): Promise<{ id: string; mime: string }> {
  const { data, mime } = await normalise(a.kind, a.buffer);
  const dir = path.join(dataDir(), 'tmp', 'assets');
  await mkdir(dir, { recursive: true });
  const base = path.join(dir, randomBytes(12).toString('hex'));
  const store = mediaStore();
  const objectKey = randomBytes(24).toString('base64url');
  let putDone = false;
  try {
    await writeFile(`${base}.plain`, data);
    const fileKey = newFileKey();
    const size = await encryptFile(`${base}.plain`, `${base}.enc`, fileKey);
    await store.put(objectKey, `${base}.enc`);
    putDone = true;
    const { data: row, error } = await adminClient()
      .from('user_assets')
      .insert({
        owner_id: a.ownerId,
        kind: a.kind,
        mime,
        storage: store.name,
        object_key: objectKey,
        wrapped_key: wrapKey(fileKey),
        plaintext_size: size,
      })
      .select('id')
      .single();
    if (error || !row) throw new Error('asset insert failed');
    putDone = false;
    return { id: row.id as string, mime };
  } catch (e) {
    if (putDone) await store.delete(objectKey).catch(() => {});
    throw e;
  } finally {
    await rm(`${base}.plain`, { force: true });
    await rm(`${base}.enc`, { force: true });
  }
}

/** Decrypts a whole (small) asset. With `expect`, the asset must also match kind and owner. */
export async function readAsset(
  assetId: string,
  expect?: { kind?: AssetKind; ownerId?: string },
): Promise<{ buffer: Buffer; mime: string }> {
  const { data } = await adminClient()
    .from('user_assets')
    .select('owner_id,kind,mime,storage,object_key,wrapped_key,plaintext_size')
    .eq('id', assetId)
    .maybeSingle();
  if (!data || (expect?.kind && data.kind !== expect.kind) || (expect?.ownerId && data.owner_id !== expect.ownerId)) {
    throw new HttpError(404, 'Not found');
  }
  const size = Number(data.plaintext_size);
  const store = storeFor(data.storage, 'normal');
  const parts: Buffer[] = [];
  for await (const c of decryptRange((s, e) => store.getRange(data.object_key, s, e), unwrapKey(data.wrapped_key), size, 0, size - 1)) {
    parts.push(c);
  }
  return { buffer: Buffer.concat(parts), mime: data.mime as string };
}

async function deleteBlobOf(row: { storage: string; object_key: string }) {
  await storeFor(row.storage as 'b2' | 'local', 'normal').delete(row.object_key);
}

export async function deleteAssetBlob(assetId: string): Promise<void> {
  const { data } = await adminClient().from('user_assets').select('storage,object_key').eq('id', assetId).maybeSingle();
  if (data) await deleteBlobOf(data);
}

export async function deleteAssetRow(assetId: string): Promise<void> {
  const { error } = await adminClient().from('user_assets').delete().eq('id', assetId);
  if (error) throw new Error('could not delete asset');
}

/** Blob first, then the row (cascades to stickers using it). */
export async function deleteAsset(assetId: string): Promise<void> {
  await deleteAssetBlob(assetId);
  await deleteAssetRow(assetId);
}

/** Removes every stored blob of a user (call before deleting the member; rows go with the profile cascade). */
export async function deleteUserAssets(userId: string): Promise<void> {
  // Other people's per-chat pictures for conversations that are about to go away with this member.
  const { data: convs } = await adminClient().from('conversations').select('id').or(`user_a.eq.${userId},user_b.eq.${userId}`);
  const convIds = (convs ?? []).map((c) => c.id as string);
  if (convIds.length) {
    const { data: cw } = await adminClient().from('chat_wallpapers').select('asset_id').in('conversation_id', convIds).not('asset_id', 'is', null);
    for (const r of cw ?? []) await deleteAsset(r.asset_id as string).catch((e) => console.error('chat wallpaper cleanup failed', e instanceof Error ? e.message : e));
  }
  const { data } = await adminClient().from('user_assets').select('id,storage,object_key').eq('owner_id', userId);
  for (const r of data ?? []) {
    await deleteBlobOf(r);
    await deleteAssetRow(r.id as string);
  }
}

// ---------------------------------------------------------------- stickers

/**
 * Viewable: official pack, own, in the collection, or (unless forSend) seen in one of the user's conversations.
 * Sending requires the first three only.
 */
export async function canViewSticker(userId: string, stickerId: string, forSend = false): Promise<boolean> {
  const db = adminClient();
  const { data: s } = await db.from('stickers').select('pack_id,creator_id').eq('id', stickerId).maybeSingle();
  if (!s) return false;
  if (s.pack_id || s.creator_id === userId) return true;
  const { data: saved } = await db
    .from('user_stickers')
    .select('sticker_id')
    .eq('user_id', userId)
    .eq('sticker_id', stickerId)
    .maybeSingle();
  if (saved) return true;
  if (forSend) return false;
  const { data: convs } = await db.from('conversations').select('id').or(`user_a.eq.${userId},user_b.eq.${userId}`);
  const ids = (convs ?? []).map((c) => c.id as string);
  if (!ids.length) return false;
  const { data: m } = await db
    .from('messages')
    .select('id')
    .eq('sticker_id', stickerId)
    .in('conversation_id', ids)
    .limit(1);
  return !!m?.length;
}

export async function createStickerPack(name: string, createdBy: string): Promise<string> {
  const n = name.trim();
  if (n.length < 1 || n.length > 40) throw new HttpError(400, 'Pack name must be 1 to 40 characters');
  const { data, error } = await adminClient().from('sticker_packs').insert({ name: n, created_by: createdBy }).select('id').single();
  if (error || !data) throw new Error('could not create pack');
  return data.id as string;
}

export async function addPackSticker(packId: string, creatorId: string, image: Buffer, emoji?: string): Promise<string> {
  const db = adminClient();
  const { data: pack } = await db.from('sticker_packs').select('id').eq('id', packId).maybeSingle();
  if (!pack) throw new HttpError(404, 'Pack not found');
  if (image.length > MAX_BYTES.sticker) throw new HttpError(413, 'File is too large');
  const asset = await storeAsset({ ownerId: creatorId, kind: 'sticker', buffer: image });
  const { data, error } = await db
    .from('stickers')
    .insert({ pack_id: packId, creator_id: creatorId, asset_id: asset.id, emoji: parseEmoji(emoji) })
    .select('id')
    .single();
  if (error || !data) {
    await deleteAsset(asset.id).catch(() => {});
    throw new Error('could not add sticker');
  }
  return data.id as string;
}

export async function removePackSticker(stickerId: string): Promise<void> {
  const { data } = await adminClient().from('stickers').select('asset_id').eq('id', stickerId).maybeSingle();
  if (data) await deleteAsset(data.asset_id as string); // cascades to the sticker and collections
}

export async function deletePack(packId: string): Promise<void> {
  const db = adminClient();
  const { data } = await db.from('stickers').select('asset_id').eq('pack_id', packId);
  for (const s of data ?? []) await deleteAsset(s.asset_id as string);
  await db.from('sticker_packs').delete().eq('id', packId);
}
