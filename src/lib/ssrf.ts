import { lookup as dnsLookup } from 'node:dns';
import https from 'node:https';
import { isIP } from 'node:net';

/** IPv4 ranges that must never be reached from the server: [base, prefix length]. */
const V4_BLOCKED: [number, number][] = [
  [0x00000000, 8], // "this" network
  [0x0a000000, 8], // private
  [0x64400000, 10], // CGNAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local + cloud metadata (169.254.169.254)
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // TEST-NET-1
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmarking
  [0xc6336400, 24], // TEST-NET-2
  [0xcb007100, 24], // TEST-NET-3
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved + broadcast
];

function v4ToInt(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function v4Public(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return false;
  return !V4_BLOCKED.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return n >= base && n < base + size;
  });
}

/** Expands an IPv6 literal into 8 16-bit groups (handles :: and a trailing dotted IPv4). */
function expandV6(ip: string): number[] | null {
  let s = ip.split('%')[0].toLowerCase();
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const n = v4ToInt(dotted[2]);
    if (n === null) return null;
    s = `${dotted[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  } else groups = head;
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

/** True only for globally routable unicast addresses (IPv4, IPv6, IPv4-mapped IPv6). */
export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Public(ip);
  if (kind !== 6) return false;
  const g = expandV6(ip);
  if (!g) return false;
  const embedV4 = (hi: number, lo: number) => v4Public(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  const first5Zero = g.slice(0, 5).every((x) => x === 0);
  if (first5Zero && g[5] === 0xffff) return embedV4(g[6], g[7]); // ::ffff:a.b.c.d
  if (first5Zero && g[5] === 0) return false; // ::, ::1 and IPv4-compatible
  if (g[0] === 0x64 && g[1] === 0xff9b) return embedV4(g[6], g[7]); // NAT64 64:ff9b::/96
  if (g[0] === 0x2002) return embedV4(g[1], g[2]); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false; // documentation
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return false; // deprecated site-local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  return (g[0] & 0xe000) === 0x2000; // only global unicast 2000::/3
}

/** Settings-time validation: https only, port 443 only, no credentials, no IP literal in a private range. */
export function assertPublicHttpsUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'https:') throw new Error('Only https URLs are allowed');
  if (u.port && u.port !== '443') throw new Error('Only port 443 is allowed');
  if (u.username || u.password) throw new Error('URL must not contain credentials');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local'))
    throw new Error('Host not allowed');
  if (isIP(host) && !isPublicIp(host)) throw new Error('Host not allowed');
  return u;
}

const MAX_BODY = 64 * 1024;

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void;

function safeLookup(hostname: string, options: { all?: boolean; family?: number }, cb: LookupCb) {
  dnsLookup(hostname, { all: true, family: options.family }, (err, addrs) => {
    if (err) return cb(err, '', 0);
    const list = addrs as { address: string; family: number }[];
    if (!list.length || list.some((a) => !isPublicIp(a.address))) {
      return cb(Object.assign(new Error('Blocked address'), { code: 'EBLOCKED' }), '', 0);
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export async function safeRequest(
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; timeoutMs?: number },
): Promise<{ status: number; bodyText: string }> {
  const u = assertPublicHttpsUrl(url);
  const timeoutMs = init.timeoutMs ?? 10_000;
  return new Promise((resolve, reject) => {
    const headers = { ...init.headers };
    if (init.body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(init.body));
    const req = https.request(
      {
        protocol: 'https:',
        hostname: u.hostname.replace(/^\[|\]$/g, ''),
        port: 443,
        path: u.pathname + u.search,
        method: init.method,
        headers,
        lookup: safeLookup as never,
        agent: false,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          if (size >= MAX_BODY) return;
          chunks.push(c.subarray(0, MAX_BODY - size));
          size += c.length;
          if (size >= MAX_BODY) res.destroy(); // enough; status is already known
        });
        const done = () => resolve({ status: res.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString('utf8') });
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.on('close', () => clearTimeout(timer));
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
