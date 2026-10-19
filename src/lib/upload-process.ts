import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { decryptChunk, encryptFile, newFileKey, unwrapKey, wrapKey } from '@/lib/crypto';
import { adminClient } from '@/lib/supabase/admin';
import { snapStore, mediaStore } from '@/lib/storage';
import {
  ALLOWED_MIMES,
  SNAP_TTL_HOURS,
  cleanupUploadSession,
  kindOf,
  setFailure,
  uploadDir,
  workDir,
  type UploadSession,
} from '@/lib/media';

class Reject extends Error {}

function runFfmpeg(input: string, output: string, format: 'mp4' | 'webm'): Promise<void> {
  const bin = process.env.FFMPEG_PATH || 'ffmpeg';
  const args = ['-nostdin', '-y', '-protocol_whitelist', 'file', '-i', input, '-map_metadata', '-1', '-c', 'copy'];
  if (format === 'mp4') args.push('-movflags', '+faststart');
  args.push('-f', format, output);
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: 'ignore', shell: false });
    const timer = setTimeout(() => p.kill('SIGKILL'), 10 * 60_000);
    p.on('error', () => {
      clearTimeout(timer);
      reject(new Reject('Video processing is not available on the server'));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Reject('This video could not be processed'));
    });
  });
}

/** Detached worker: assemble, verify, strip metadata, encrypt, store, create the message. */
export async function processUpload(sessionId: string): Promise<void> {
  const db = adminClient();
  let stored: { name: 'b2' | 'local'; del: () => Promise<void> } | null = null;
  let messageId: string | null = null;
  try {
    const { data } = await db.from('upload_sessions').select('*').eq('id', sessionId).single();
    const s = data as UploadSession;
    const { data: st } = await db.from('app_settings').select('photo_max_mb,video_max_mb').eq('id', 1).single();
    const dir = workDir(sessionId);
    await mkdir(dir, { recursive: true });

    // 1. decrypt chunks in order into one plain temp file
    const tempKey = unwrapKey(s.temp_key_wrapped);
    const rawPath = path.join(dir, 'raw');
    const fh = await open(rawPath, 'w');
    let total = 0;
    try {
      for (let i = 0; i < s.total_chunks; i++) {
        const blob = await readFile(path.join(uploadDir(sessionId), `${i}.part`));
        const plain = decryptChunk(blob, tempKey, `${sessionId}:${i}`);
        total += plain.length;
        await fh.write(plain);
      }
    } finally {
      await fh.close();
    }
    if (total !== Number(s.total_size)) throw new Reject('Upload size mismatch');

    // 2. real type, never the declared one
    // Only the first bytes decide the type. (fileTypeFromFile needs extra Node-only packages that the standalone build does not ship.)
    const head = Buffer.alloc(4100);
    const hfh = await open(rawPath, 'r');
    let headLen = 0;
    try {
      headLen = (await hfh.read(head, 0, head.length, 0)).bytesRead;
    } finally {
      await hfh.close();
    }
    const ft = await fileTypeFromBuffer(head.subarray(0, headLen));
    const detected = ft?.mime as (typeof ALLOWED_MIMES)[number] | undefined;
    if (!detected || !ALLOWED_MIMES.includes(detected)) throw new Reject('This file type is not supported');
    const kind = kindOf(detected);
    if (kind !== kindOf(s.mime)) throw new Reject('File does not match its declared type');
    const limit = (kind === 'image' ? st?.photo_max_mb : st?.video_max_mb) ?? 10;
    const maxBytes = Number(limit) * 1024 * 1024;

    // 3. strip metadata
    let cleanPath = rawPath;
    let finalMime: string = detected;
    if (kind === 'image') {
      cleanPath = path.join(dir, 'clean');
      try {
        // Re-encoding drops EXIF/GPS and any comment blocks (GIF too); animation is kept for WebP and GIF.
        const animated = detected === 'image/webp' || detected === 'image/gif';
        const img = sharp(rawPath, { animated, limitInputPixels: 40_000_000, failOn: 'error' }).rotate();
        await (detected === 'image/jpeg'
          ? img.jpeg({ quality: 90 })
          : detected === 'image/png'
            ? img.png()
            : detected === 'image/gif'
              ? img.gif()
              : img.webp({ quality: 90 })
        ).toFile(cleanPath);
      } catch {
        throw new Reject('This image could not be read');
      }
    } else if (kind === 'video') {
      cleanPath = path.join(dir, 'clean');
      const fmt = detected === 'video/webm' ? 'webm' : 'mp4';
      await runFfmpeg(rawPath, cleanPath, fmt);
      finalMime = fmt === 'webm' ? 'video/webm' : 'video/mp4';
    }
    const cleanSize = (await stat(cleanPath)).size;
    if (cleanSize <= 0) throw new Reject('Empty file');
    if (cleanSize > maxBytes) throw new Reject(`File is too large (max ${limit} MB)`);

    // 4. encrypt with a fresh key, upload
    const fileKey = newFileKey();
    const encPath = path.join(dir, 'enc');
    const plainSize = await encryptFile(cleanPath, encPath, fileKey);
    const store = s.mode === 'normal' ? mediaStore() : snapStore();
    const objectKey = randomBytes(24).toString('base64url');
    stored = { name: store.name, del: () => store.delete(objectKey) };
    await store.put(objectKey, encPath);

    // 5. database rows (upload session id doubles as media id)
    const { data: msg, error: mErr } = await db
      .from('messages')
      .insert({ conversation_id: s.conversation_id, sender_id: s.user_id, type: 'media', body: '' })
      .select('id')
      .single();
    if (mErr || !msg) throw new Error('message insert failed');
    messageId = msg.id as string;
    const snap = s.mode !== 'normal';
    const { error: iErr } = await db.from('media_items').insert({
      id: sessionId,
      message_id: messageId,
      conversation_id: s.conversation_id,
      sender_id: s.user_id,
      kind,
      mime: finalMime,
      size_bytes: plainSize,
      mode: s.mode,
      timer_seconds: s.mode === 'timed' ? s.timer_seconds : null,
      expires_at: snap ? new Date(Date.now() + SNAP_TTL_HOURS * 3600_000).toISOString() : null,
    });
    if (iErr) throw new Error('media insert failed');
    const { error: kErr } = await db.from('media_keys').insert({
      media_id: sessionId,
      storage: store.name,
      object_key: objectKey,
      wrapped_key: wrapKey(fileKey),
      plaintext_size: plainSize,
    });
    if (kErr) throw new Error('key insert failed');

    await db.from('upload_sessions').update({ status: 'done' }).eq('id', sessionId);
    stored = null; // success: keep the blob
  } catch (e) {
    setFailure(sessionId, e instanceof Reject ? e.message : 'Processing failed');
    if (!(e instanceof Reject)) console.error('upload processing failed', e instanceof Error ? e.message : e);
    try {
      await stored?.del();
      if (messageId) await db.from('messages').delete().eq('id', messageId); // cascades media rows
    } catch {
      /* best effort */
    }
    await db.from('upload_sessions').update({ status: 'failed' }).eq('id', sessionId);
  } finally {
    await cleanupUploadSession(sessionId).catch(() => {});
  }
}
