import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/auth';

// The public half of the VAPID pair. Public by design, but only handed to signed-in people.
export const GET = handle(async () => {
  await requireUser();
  const key = process.env.VAPID_PUBLIC_KEY ?? '';
  return NextResponse.json({ key }, { headers: { 'Cache-Control': 'no-store' } });
});
