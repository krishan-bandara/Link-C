// The address a request really came from, for per-IP rate limits.
//
// Never trust the FIRST x-forwarded-for entry: the client can write anything there. In production the app only
// listens on 127.0.0.1 and is reached through Cloudflare's tunnel, which sets cf-connecting-ip itself and
// appends the real peer to the end of x-forwarded-for. So: prefer cf-connecting-ip, otherwise the LAST
// x-forwarded-for entry (added by the nearest proxy), otherwise one shared bucket.
export function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const parts = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'unknown';
}
