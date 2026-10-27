import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { makeHdPreview } from '@/lib/image-preview';
import { decryptChunk, encryptFile, newFileKey, unwrapKey, wrapKey } from '@/lib/crypto';
import { adminClient } from '@/lib/supabase/admin';
import { snapStore, mediaStore } from '@/lib/storage';
import {
  ALLOWED_MIMES,
  AUDIO_FFMPEG_FORMAT_ARGS,
  AUDIO_FINAL_MIME,
  AUDIO_MAX_MB,
  SNAP_TTL_HOURS,
  audioFormatOf,
  probeProblem,
  cleanupUploadSession,
  kindOf,
  setFailure,
  uploadDir,
  workDir,
  type UploadSession,
} from '@/lib/media';

class Reject extends Error {}

function runFfmpeg(input: string, output: string, formatArgs: string[], what = 'video'): Promise<void> {
  const bin = process.env.FFMPEG_PATH || 'ffmpeg';
  const args = ['-nostdin', '-y', '-protocol_whitelist', 'file', '-i', input, '-map_metadata', '-1', '-c', 'copy', ...formatArgs, output];
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: 'ignore', shell: false });
    const timer = setTimeout(() => p.kill('SIGKILL'), 10 * 60_000);
    p.on('error', () => {
      clearTimeout(timer);
      reject(new Reject(`${what[0].toUpperCase()}${what.slice(1)} processing is not available on the server`));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Reject(`This ${what} could not be processed`));
    });
  });
}

/** ffprobe -v error -show_streams -of json <file>; 10 s timeout, no shell. Resolves to the parsed JSON. */
function probeStreams(input: string): Promise<unknown> {
  const bin = process.env.FFPROBE_PATH || 'ffprobe';
  const args = ['-v', 'error', '-protocol_whitelist', 'file', '-show_streams', '-of', 'json', input];
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'], shell: false });
    let out = '';
    p.stdout.on('data', (d: Buffer) => {
      if (out.length < 1_000_000) out += d.toString('utf8');
    });
    const timer = setTimeout(() => p.kill('SIGKILL'), 10_000);
    p.on('error', () => {
      clearTimeout(timer);
      reject(new Reject('Media processing is not available on the server'));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Reject('This file could not be read'));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Reject('This file could not be read'));
      }
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
    const detected = ft?.mime;
    if (!detected) throw new Reject('This file type is not supported');
    const declaredKind = kindOf(s.mime);
    // Audio-only WebM/MP4 files are detected as video/webm or video/mp4: ffprobe decides below.
    const audioFormat = declaredKind === 'audio' ? audioFormatOf(detected) : null;
    if (declaredKind === 'audio') {
      if (!audioFormat) throw new Reject('File does not match its declared type');
      if (s.mode !== 'normal') throw new Reject('Voice messages cannot be snaps');
    } else {
      if (!(ALLOWED_MIMES as readonly string[]).includes(detected)) throw new Reject('This file type is not supported');
      if (kindOf(detected) !== declaredKind) throw new Reject('File does not match its declared type');
    }
    const kind = declaredKind;
    const limit = (kind === 'audio' ? AUDIO_MAX_MB : kind === 'image' ? st?.photo_max_mb : st?.video_max_mb) ?? 10;
    const maxBytes = Number(limit) * 1024 * 1024;

    // 3. strip metadata
    let cleanPath = rawPath;
    let finalMime: string = detected;
    let previewPath: string | null = null; // HD photos in chat get a lighter preview for the bubble
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
        if (s.mode === 'normal') {
          const p = path.join(dir, 'preview');
          if (await makeHdPreview(cleanPath, p)) previewPath = p;
        }
      } catch {
        throw new Reject('This image could not be read');
      }
    } else if (kind === 'video') {
      cleanPath = path.join(dir, 'clean');
      // Extra safety check only: if ffprobe is unavailable or cannot read the file, ffmpeg below still validates it,
      // so videos keep working exactly as before. A file that provably has no picture is rejected.
      const problem = await probeStreams(rawPath).then(
        (info) => probeProblem(info, 'video'),
        () => null,
      );
      if (problem) throw new Reject(problem);
      const fmt = detected === 'video/webm' ? 'webm' : 'mp4';
      await runFfmpeg(rawPath, cleanPath, fmt === 'mp4' ? ['-f', 'mp4', '-movflags', '+faststart'] : ['-f', 'webm']);
      finalMime = fmt === 'webm' ? 'video/webm' : 'video/mp4';
    } else if (audioFormat) {
      // Confirm the container really holds sound and no picture, then re-mux without metadata.
      const problem = probeProblem(await probeStreams(rawPath), 'audio');
      if (problem) throw new Reject(problem);
      cleanPath = path.join(dir, 'clean');
      await runFfmpeg(rawPath, cleanPath, AUDIO_FFMPEG_FORMAT_ARGS[audioFormat], 'audio file');
      finalMime = AUDIO_FINAL_MIME[audioFormat];
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

    let preview: { objectKey: string; wrappedKey: string; size: number } | null = null;
    if (previewPath) {
      const previewKey = newFileKey();
      const previewEnc = path.join(dir, 'preview-enc');
      const previewSize = await encryptFile(previewPath, previewEnc, previewKey);
      const previewObjectKey = randomBytes(24).toString('base64url');
      const mainDel = stored.del;
      stored = { name: store.name, del: async () => { await mainDel(); await store.delete(previewObjectKey); } };
      await store.put(previewObjectKey, previewEnc);
      preview = { objectKey: previewObjectKey, wrappedKey: wrapKey(previewKey), size: previewSize };
    }

    // 5. database rows (upload session id doubles as media id)
    const { data: msg, error: mErr } = await db
      .from('messages')
      .insert({ conversation_id: s.conversation_id, sender_id: s.user_id, type: 'media', body: '', reply_to: s.reply_to ?? null })
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
      hd: !!preview,
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
      preview_object_key: preview?.objectKey ?? null,
      preview_wrapped_key: preview?.wrappedKey ?? null,
      preview_size: preview?.size ?? null,
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
