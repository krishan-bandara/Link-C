import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { z } from 'zod';
import { handle, HttpError, requireConversation, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

const Body = z.object({ conversationId: z.string().uuid() });

export const POST = handle(async (req: Request) => {
  const { user, supabase } = await requireUser();
  const { conversationId } = Body.parse(await req.json().catch(() => ({})));
  if (!rateLimit(`call-token:${user.id}`, 20, 60_000)) throw new HttpError(429, 'Too many requests');
  await requireConversation(supabase, user.id, conversationId);

  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!key || !secret || !url) return NextResponse.json({ error: 'Calls are not configured yet' }, { status: 503 });

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
  const room = `conv-${conversationId}`;
  const at = new AccessToken(key, secret, {
    identity: user.id,
    name: profile?.display_name ?? 'Member',
    ttl: 600,
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  return NextResponse.json({ token: await at.toJwt(), url, room });
});
