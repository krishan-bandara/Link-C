import { NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/auth';
import { lookupInviteToken } from '@/lib/invites';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';

export const GET = handle(async (req: Request) => {
  const ip = clientIp(req);
  if (!rateLimit(`invite-check:${ip}`, 30, 10 * 60_000)) throw new HttpError(429, 'Too many attempts. Try again later.');
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const found = await lookupInviteToken(token);
  const headers = { 'Cache-Control': 'no-store' };
  if (!found) return NextResponse.json({ valid: false }, { headers });
  return NextResponse.json({ valid: true, purpose: found.purpose, email: found.email, ...(found.name ? { name: found.name } : {}) }, { headers });
});
