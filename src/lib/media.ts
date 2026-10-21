import path from 'node:path';
import { z } from 'zod';
import { HttpError } from '@/lib/errors';
import { adminClient } from '@/lib/supabase/admin';
import { dataDir, rm, storeFor } from '@/lib/storage';

export const CHUNK_SIZE = 8 * 1024 * 1024;
export const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;
export const SNAP_TTL_HOURS = 24;

export const uuidSchema = z.string().uuid();
export const parseId = (v: string) => {
  const r = uuidSchema.safeParse(v);
  if (!r.success) throw new HttpError(404, 'Not found');
  return r.data;
};

export const kindOf = (mime: string): 'image' | 'video' => (mime.startsWith('image/') ? 'image' : 'video');

// Temp areas (ids are server-generated uuids, never user paths).
export const uploadDir = (id: string) => path.join(dataDir(), 'tmp', 'uploads', parseId(id));
export const workDir = (id: string) => path.join(dataDir(), 'tmp', 'work', parseId(id));

// Process-local failure reasons (no column for it); GET falls back to a generic message.
const failures = new Map<string, string>();
export const setFailure = (id: string, msg: string) => {
  failures.set(id, msg);
  if (failures.size > 500) failures.delete(failures.keys().next().value as string);
};
export const getFailure = (id: string) => failures.get(id);

export type UploadSession = {
  id: string;
  user_id: string;
  conversation_id: string;
  mime: string;
  total_size: number;
  chunk_size: number;
  total_chunks: number;
  received: number[];
  mode: 'normal' | 'once' | 'timed';
  timer_seconds: number | null;
  temp_key_wrapped: string;
  reply_to: string | null;
  status: 'uploading' | 'processing' | 'done' | 'failed';
  expires_at: string;
};

/** Loads an upload session that belongs to the caller (404 otherwise, so ids cannot be probed). */
export async function ownedSession(userId: string, id: string): Promise<UploadSession> {
  const { data } = await adminClient()
    .from('upload_sessions')
    .select('*')
    .eq('id', parseId(id))
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) throw new HttpError(404, 'Upload not found');
  return data as UploadSession;
}

/** Removes every temp file of an upload session (encrypted chunks and work files). */
export async function cleanupUploadSession(id: string) {
  await rm(uploadDir(id), { recursive: true, force: true });
  await rm(workDir(id), { recursive: true, force: true });
}

/**
 * Mirror of the database rule (migration 11) for messages and media rows: a row is visible to a person unless it was
 * created before their clear-chat time or they hid it ("delete for me"). The RLS policies are the real enforcement;
 * this helper documents the rule and is unit-tested. Routes must read media through the caller's RLS client.
 */
export function isVisibleToViewer(row: {
  createdAt: Date | string;
  clearedAt?: Date | string | null;
  hidden?: boolean;
}): boolean {
  if (row.hidden) return false;
  if (row.clearedAt == null) return true;
  return new Date(row.createdAt).getTime() > new Date(row.clearedAt).getTime();
}

/** Permanently removes the stored blob (all versions on B2) and the key row; marks the item deleted. */
export async function deleteMediaBlobs(mediaId: string) {
  const db = adminClient();
  const { data: item } = await db.from('media_items').select('mode').eq('id', mediaId).maybeSingle();
  const { data: key } = await db
    .from('media_keys')
    .select('storage,object_key')
    .eq('media_id', mediaId)
    .maybeSingle();
  if (key && item) {
    await storeFor(key.storage as 'b2' | 'local', item.mode as 'normal' | 'once' | 'timed').delete(key.object_key);
  }
  if (key) {
    const { error } = await db.from('media_keys').delete().eq('media_id', mediaId);
    if (error) throw new Error('could not delete media key');
  }
  await db
    .from('media_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', mediaId)
    .is('deleted_at', null);
}
