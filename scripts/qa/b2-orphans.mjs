// Lists (and with --apply deletes) Backblaze objects that no database row points to. Run from the repo root: node --env-file=.env scripts/qa/b2-orphans.mjs [--apply]
import { S3Client, ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { admin } from './helpers.mjs';
const APPLY = process.argv.includes('--apply');
const db = admin();
const s3 = new S3Client({ endpoint: process.env.B2_ENDPOINT, region: process.env.B2_REGION, credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APP_KEY }, forcePathStyle: true });
const known = new Set();
for (const t of ['media_keys', 'user_assets']) {
  const { data, error } = await db.from(t).select(t === 'media_keys' ? 'object_key,preview_object_key,storage' : 'object_key,storage').eq('storage', 'b2');
  if (error) throw error;
  for (const r of data) { known.add(r.object_key); if (r.preview_object_key) known.add(r.preview_object_key); }
}
let all = [], km, vm;
do {
  const p = await s3.send(new ListObjectVersionsCommand({ Bucket: process.env.B2_BUCKET, KeyMarker: km, VersionIdMarker: vm }));
  all.push(...(p.Versions ?? []), ...(p.DeleteMarkers ?? []));
  km = p.IsTruncated ? p.NextKeyMarker : undefined; vm = p.IsTruncated ? p.NextVersionIdMarker : undefined;
} while (km);
const orphans = all.filter((o) => !known.has(o.Key));
console.log(`bucket entries: ${all.length} | referenced by the database: ${all.length - orphans.length} | orphans: ${orphans.length} (${Math.round(orphans.reduce((s, o) => s + (o.Size ?? 0), 0) / 1024)} KB)`);
for (const o of orphans) console.log(' orphan', o.Key.slice(0, 8) + '…', o.Size ?? 'marker', 'bytes', o.LastModified?.toISOString?.().slice(0, 16));
if (APPLY) { for (const o of orphans) await s3.send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET, Key: o.Key, VersionId: o.VersionId })); console.log('deleted', orphans.length); }
